// Integration tests for calculate-leaderboard Edge Function
// Run with: deno test supabase/functions/calculate-leaderboard/index.test.ts --allow-env

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"

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
// Tests
// ---------------------------------------------------------------------------

Deno.test("calculate-leaderboard", async (t) => {
  Deno.env.set("SUPABASE_URL", "http://localhost:54321")
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key")
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

  const { handler } = await import("./index.ts")

  const today = new Date().toISOString().split("T")[0]

  const USERS = [
    { id: "user-1", total_commits: 100, historical_commits: 200 },
    { id: "user-2", total_commits: 50, historical_commits: 50 },
    { id: "user-3", total_commits: 100, historical_commits: 200 }, // tied with user-1
  ]

  const DAILY_COMMITS = [
    { user_id: "user-1", commit_count: 5 },
    { user_id: "user-2", commit_count: 10 },
    // user-3 has no commits for this period
  ]

  await t.step("should reject unauthenticated requests with 401", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "POST" }))
    assertEquals(res.status, 401)
  })

  await t.step("should handle CORS OPTIONS", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "OPTIONS" }))
    assertEquals(res.status, 200)
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  })

  await t.step("should return success with 0 users", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      { match: (url) => url.includes("/rest/v1/users"), respond: () => jsonRes([]) },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.success, true)
    assertEquals(body.users, 0)

    globalThis.fetch = originalFetch
  })

  await t.step("should assign ranks with RANK() semantics (ties get same rank)", async () => {
    const originalFetch = globalThis.fetch

    const upserted: unknown[] = []

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && !url.includes("PATCH"),
        respond: () => jsonRes(USERS),
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits") && url.includes("select=user_id"),
        respond: () => jsonRes(DAILY_COMMITS),
      },
      {
        match: (url, m) => url.includes("/rest/v1/leaderboard_cache") && m === "POST",
        respond: (_url, init) => {
          upserted.push(JSON.parse(init?.body as string))
          return jsonRes(null, 201)
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.success, true)
    assertEquals(body.periods, 4)
    assertEquals(body.users, 3)

    // Check the all_time period for RANK() semantics
    // user-1: 100+200=300, user-3: 100+200=300 (tied), user-2: 50+50=100
    const allTimeRows = upserted.flat().filter(
      (r: any) => r.period === "all_time"
    ) as Array<{ user_id: string; score: number; rank: number }>

    const user1 = allTimeRows.find((r) => r.user_id === "user-1")!
    const user2 = allTimeRows.find((r) => r.user_id === "user-2")!
    const user3 = allTimeRows.find((r) => r.user_id === "user-3")!

    assertEquals(user1.score, 300)
    assertEquals(user3.score, 300)
    assertEquals(user2.score, 100)

    // Tied users get same rank, next rank skips
    assertEquals(user1.rank, 1)
    assertEquals(user3.rank, 1) // tied with user-1
    assertEquals(user2.rank, 3) // skips rank 2

    globalThis.fetch = originalFetch
  })

  await t.step("should include users with 0 commits for a period", async () => {
    const originalFetch = globalThis.fetch

    const upserted: unknown[] = []

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && !url.includes("PATCH"),
        respond: () => jsonRes(USERS),
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits"),
        respond: () => jsonRes(DAILY_COMMITS), // only user-1 and user-2 have commits
      },
      {
        match: (url, m) => url.includes("/rest/v1/leaderboard_cache") && m === "POST",
        respond: (_url, init) => {
          upserted.push(JSON.parse(init?.body as string))
          return jsonRes(null, 201)
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)

    // Check that user-3 gets a daily entry with score 0
    const dailyRows = upserted.flat().filter(
      (r: any) => r.period === "daily"
    ) as Array<{ user_id: string; score: number; rank: number }>

    assertEquals(dailyRows.length, 3) // all 3 users included
    const user3Daily = dailyRows.find((r) => r.user_id === "user-3")!
    assertEquals(user3Daily.score, 0)

    globalThis.fetch = originalFetch
  })

  await t.step("should calculate time-bounded period scores correctly", async () => {
    const originalFetch = globalThis.fetch

    const upserted: unknown[] = []

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && !url.includes("PATCH"),
        respond: () => jsonRes(USERS),
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits"),
        respond: () => jsonRes(DAILY_COMMITS),
      },
      {
        match: (url, m) => url.includes("/rest/v1/leaderboard_cache") && m === "POST",
        respond: (_url, init) => {
          upserted.push(JSON.parse(init?.body as string))
          return jsonRes(null, 201)
        },
      },
    ])

    await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    // For daily/weekly/monthly: user-2 has 10 commits, user-1 has 5
    const weeklyRows = upserted.flat().filter(
      (r: any) => r.period === "weekly"
    ) as Array<{ user_id: string; score: number; rank: number }>

    const u1 = weeklyRows.find((r) => r.user_id === "user-1")!
    const u2 = weeklyRows.find((r) => r.user_id === "user-2")!

    assertEquals(u2.score, 10)
    assertEquals(u1.score, 5)
    assertEquals(u2.rank, 1)
    assertEquals(u1.rank, 2)

    globalThis.fetch = originalFetch
  })
})
