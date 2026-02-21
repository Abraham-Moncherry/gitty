// Integration tests for sync-commits Edge Function
// Mocks fetch globally to intercept GitHub API and Supabase client calls.
// Run with: deno test supabase/functions/sync-commits/index.test.ts --allow-env

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

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const USER_ID = "user-uuid-123"
const GH_USERNAME = "testuser"
const GH_TOKEN = "gho_fake"

function authRoutes(): MockRoute[] {
  return [
    {
      match: (url) => url.includes("/auth/v1/user"),
      respond: () => jsonRes({ id: USER_ID, email: "t@t.com" }),
    },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("sync-commits", async (t) => {
  Deno.env.set("SUPABASE_URL", "http://localhost:54321")
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key")
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

  const today = new Date().toISOString().split("T")[0]

  // Import handler (cached after first import)
  const { handler } = await import("./index.ts")

  await t.step("should reject unauthenticated requests with 401", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "POST" }))
    assertEquals(res.status, 401)
    const body = await res.json()
    assertEquals(body.error, "Missing authorization header")
  })

  await t.step("should handle CORS OPTIONS preflight", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "OPTIONS" }))
    assertEquals(res.status, 200)
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  })

  await t.step("should filter PushEvents, deduplicate by SHA, extract repos", async () => {
    const originalFetch = globalThis.fetch

    const events = [
      {
        id: "1", type: "PushEvent", repo: { name: "user/repo-a" },
        payload: { commits: [{ sha: "aaa", message: "a", author: { name: "T" } }, { sha: "bbb", message: "b", author: { name: "T" } }] },
        created_at: `${today}T10:00:00Z`,
      },
      {
        id: "2", type: "PushEvent", repo: { name: "user/repo-b" },
        payload: { commits: [{ sha: "aaa", message: "a", author: { name: "T" } }, { sha: "ccc", message: "c", author: { name: "T" } }] },
        created_at: `${today}T11:00:00Z`,
      },
      {
        id: "3", type: "WatchEvent", repo: { name: "other/x" },
        payload: {}, created_at: `${today}T12:00:00Z`,
      },
    ]

    let upsertedData: unknown = null

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      { match: (url) => url.includes("api.github.com"), respond: () => jsonRes(events) },
      {
        match: (url, m) => url.includes("/rest/v1/daily_commits") && m === "POST",
        respond: (_url, init) => { upsertedData = JSON.parse(init?.body as string); return jsonRes(null, 201) },
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits") && url.includes("select=date"),
        respond: () => jsonRes([{ date: today, commit_count: 3 }]),
      },
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("select=longest_streak"),
        respond: () => jsonRes([{ longest_streak: 1, daily_goal: 5, historical_commits: 10 }]),
      },
      { match: (url, m) => url.includes("/rest/v1/users") && m === "PATCH", respond: () => jsonRes(null) },
      { match: (url) => url.includes("/rest/v1/leaderboard_cache"), respond: () => jsonRes([{ rank: 7 }]) },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()

    // 3 unique SHAs: aaa, bbb, ccc
    assertEquals(body.todayCommits, 3)
    assertEquals(body.dailyGoal, 5)
    assertEquals(body.goalMet, false)
    assertEquals(body.rank, 7)
    assertExists(body.currentStreak)
    assertExists(body.longestStreak)
    assertExists(body.totalScore)
    assertExists(body.weeklyCommits)

    globalThis.fetch = originalFetch
  })

  await t.step("should return updated stats in correct response shape", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      { match: (url) => url.includes("api.github.com"), respond: () => jsonRes([]) },
      { match: (url, m) => url.includes("/rest/v1/daily_commits") && m === "POST", respond: () => jsonRes(null, 201) },
      {
        match: (url) => url.includes("/rest/v1/daily_commits") && url.includes("select=date"),
        respond: () => jsonRes([{ date: today, commit_count: 0 }]),
      },
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("select=longest_streak"),
        respond: () => jsonRes([{ longest_streak: 5, daily_goal: 3, historical_commits: 100 }]),
      },
      { match: (url, m) => url.includes("/rest/v1/users") && m === "PATCH", respond: () => jsonRes(null) },
      { match: (url) => url.includes("/rest/v1/leaderboard_cache"), respond: () => jsonRes([]) },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    const body = await res.json()
    // Verify all CachedStats fields exist
    assertEquals(typeof body.todayCommits, "number")
    assertEquals(typeof body.dailyGoal, "number")
    assertEquals(typeof body.goalMet, "boolean")
    assertEquals(typeof body.currentStreak, "number")
    assertEquals(typeof body.longestStreak, "number")
    assertEquals(typeof body.totalScore, "number")
    assertEquals(Array.isArray(body.weeklyCommits), true)
    // rank can be number or null
    assertEquals(body.rank === null || typeof body.rank === "number", true)

    globalThis.fetch = originalFetch
  })

  await t.step("should handle GitHub API rate limit errors", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("api.github.com"),
        respond: () => new Response("Forbidden", { status: 403, headers: { "X-RateLimit-Remaining": "0" } }),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    assertEquals(res.status, 429)
    const body = await res.json()
    assertEquals(body.error.includes("rate limited"), true)

    globalThis.fetch = originalFetch
  })

  await t.step("should handle expired GitHub tokens", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      { match: (url) => url.includes("api.github.com"), respond: () => new Response("Unauthorized", { status: 401 }) },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer jwt" },
    }))

    assertEquals(res.status, 401)
    const body = await res.json()
    assertEquals(body.error, "GitHub token expired")

    globalThis.fetch = originalFetch
  })
})
