// Integration tests for backfill-history Edge Function
// Run with: deno test supabase/functions/backfill-history/index.test.ts --allow-env

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts"

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockRoute {
  match: (url: string, method: string) => boolean
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>
}

function createFetchRouter(routes: MockRoute[]) {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const method = init?.method ?? "GET"
    for (const route of routes) {
      if (route.match(url, method)) return Promise.resolve(route.respond(url, init))
    }
    return Promise.resolve(jsonRes({ error: `No mock for ${method} ${url}` }, 500))
  }
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })
}

const USER_ID = "user-uuid-123"
const GH_USERNAME = "testuser"
const GH_TOKEN = "gho_fake"

function authRoutes(): MockRoute[] {
  return [
    { match: (url) => url.includes("/auth/v1/user"), respond: () => jsonRes({ id: USER_ID }) },
    {
      match: (url) => url.includes("/auth/v1/admin/users/"),
      respond: () => jsonRes({
        user: {
          id: USER_ID,
          identities: [{ provider: "github", identity_data: { provider_token: GH_TOKEN, user_name: GH_USERNAME } }],
          user_metadata: {},
        },
      }),
    },
    {
      match: (url) => url.includes("/rest/v1/users") && url.includes("select=github_username"),
      respond: () => jsonRes([{ github_username: GH_USERNAME, timezone: "UTC" }]),
    },
  ]
}

function makeGraphQLRoute(yearContributions: number, dailyData: Array<{ date: string; contributionCount: number }>, allTimeTotal: number): MockRoute {
  let callCount = 0
  return {
    match: (url) => url.includes("api.github.com/graphql"),
    respond: (_url, init) => {
      callCount++
      const body = JSON.parse(init?.body as string)
      // First call = current year query (has "from" variable), second = all-time
      if (body.variables?.from || callCount === 1) {
        return jsonRes({
          data: {
            user: {
              contributionsCollection: {
                contributionCalendar: {
                  totalContributions: yearContributions,
                  weeks: [{ contributionDays: dailyData }],
                },
              },
            },
          },
        })
      }
      // All-time query
      return jsonRes({
        data: {
          user: {
            contributionsCollection: {
              contributionCalendar: { totalContributions: allTimeTotal },
            },
            createdAt: "2020-01-01T00:00:00Z",
          },
        },
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("backfill-history", async (t) => {
  Deno.env.set("SUPABASE_URL", "http://localhost:54321")
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key")
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

  const { handler } = await import("./index.ts")

  await t.step("should reject unauthenticated requests with 401", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "POST" }))
    assertEquals(res.status, 401)
  })

  await t.step("should skip if backfill_completed is true", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("select=backfill_completed"),
        respond: () => jsonRes([{ backfill_completed: true }]),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.skipped, true)

    globalThis.fetch = originalFetch
  })

  await t.step("should process contributions and return correct stats", async () => {
    const originalFetch = globalThis.fetch

    const dailyData = [
      { date: "2026-02-19", contributionCount: 5 },
      { date: "2026-02-20", contributionCount: 3 },
      { date: "2026-02-21", contributionCount: 0 }, // 0 should be skipped
    ]
    const yearTotal = 8 // 5 + 3
    const allTimeTotal = 500

    let patchedData: unknown = null
    let upsertCalls = 0

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("select=backfill_completed"),
        respond: () => jsonRes([{ backfill_completed: false }]),
      },
      {
        match: (url, m) => url.includes("/rest/v1/users") && m === "PATCH",
        respond: (_url, init) => { patchedData = JSON.parse(init?.body as string); return jsonRes(null) },
      },
      makeGraphQLRoute(yearTotal, dailyData, allTimeTotal),
      {
        match: (url, m) => url.includes("/rest/v1/daily_commits") && m === "POST",
        respond: () => { upsertCalls++; return jsonRes(null, 201) },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()

    assertEquals(body.backfilled, true)
    assertEquals(body.currentYearCommits, 8)
    assertEquals(body.historicalCommits, 492) // 500 - 8
    assertEquals(body.totalContributions, 500)
    assertEquals(body.daysProcessed, 2) // only days with contributionCount > 0
    assertExists(body.currentStreak)
    assertExists(body.longestStreak)

    // Verify backfill_completed was set to true in the final update
    assertEquals((patchedData as Record<string, unknown>)?.backfill_completed, true)

    globalThis.fetch = originalFetch
  })

  await t.step("should handle user with 0 contributions", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("select=backfill_completed"),
        respond: () => jsonRes([{ backfill_completed: false }]),
      },
      { match: (url, m) => url.includes("/rest/v1/users") && m === "PATCH", respond: () => jsonRes(null) },
      makeGraphQLRoute(0, [], 0),
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.backfilled, true)
    assertEquals(body.currentYearCommits, 0)
    assertEquals(body.historicalCommits, 0)
    assertEquals(body.daysProcessed, 0)

    globalThis.fetch = originalFetch
  })

  await t.step("should keep backfill_completed = false on failure", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("select=backfill_completed"),
        respond: () => jsonRes([{ backfill_completed: false }]),
      },
      { match: (url, m) => url.includes("/rest/v1/users") && m === "PATCH", respond: () => jsonRes(null) },
      // GraphQL returns 401
      { match: (url) => url.includes("api.github.com/graphql"), respond: () => new Response("Unauthorized", { status: 401 }) },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    // Should return error, NOT mark backfill as complete
    assertEquals(res.status, 401)
    const body = await res.json()
    assertEquals(body.error, "GitHub token expired")

    globalThis.fetch = originalFetch
  })

  await t.step("should handle GraphQL rate limit errors", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("select=backfill_completed"),
        respond: () => jsonRes([{ backfill_completed: false }]),
      },
      { match: (url, m) => url.includes("/rest/v1/users") && m === "PATCH", respond: () => jsonRes(null) },
      {
        match: (url) => url.includes("api.github.com/graphql"),
        respond: () => jsonRes({ errors: [{ message: "API rate limit exceeded" }] }),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    assertEquals(res.status, 422)
    const body = await res.json()
    assertEquals(body.error.includes("rate limit"), true)

    globalThis.fetch = originalFetch
  })
})
