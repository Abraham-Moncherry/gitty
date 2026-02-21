// Integration tests for check-notifications Edge Function
// Run with: deno test supabase/functions/check-notifications/index.test.ts --allow-env

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

Deno.test({ name: "check-notifications", sanitizeResources: false, sanitizeOps: false, fn: async (t) => {
  Deno.env.set("SUPABASE_URL", "http://localhost:54321")
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key")
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

  const { handler } = await import("./index.ts")

  await t.step("should reject unauthenticated requests with 401", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "POST" }))
    assertEquals(res.status, 401)
    const body = await res.json()
    assertEquals(body.error, "Unauthorized")
  })

  await t.step("should handle CORS OPTIONS", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "OPTIONS" }))
    assertEquals(res.status, 200)
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  })

  await t.step("should return success with 0 notifications when no users", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users"),
        respond: () => jsonRes([]),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.success, true)
    assertEquals(body.notificationsQueued, 0)

    globalThis.fetch = originalFetch
  })

  await t.step("should queue goal_reminder when user has not met daily goal", async () => {
    const originalFetch = globalThis.fetch

    // Simulate the current time being the user's notification_time
    const now = new Date()
    const currentHH = now.toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    const inserted: unknown[] = []

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("notifications_enabled"),
        respond: () => jsonRes([{
          id: "user-1",
          daily_goal: 5,
          current_streak: 3,
          timezone: "UTC",
          notification_time: `${currentHH}:00`, // matches current time
        }]),
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits"),
        respond: () => jsonRes({ commit_count: 2, goal_met: false }),
      },
      {
        match: (url) => url.includes("/rest/v1/notification_queue") && url.includes("select=type"),
        respond: () => jsonRes([]),
      },
      {
        match: (url, m) => url.includes("/rest/v1/notification_queue") && m === "POST",
        respond: (_url, init) => {
          inserted.push(JSON.parse(init?.body as string))
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
    assertEquals(body.usersChecked, 1)
    // Should have queued both goal_reminder and streak_warning (streak > 0 but 0 daily commits... wait, commit_count is 2)
    // Actually commit_count is 2, so no streak_warning. Only goal_reminder.
    assertEquals(body.notificationsQueued, 1)

    // Verify the goal reminder content
    const goalReminder = inserted.find((n: any) => n.type === "goal_reminder") as any
    assertEquals(goalReminder.type, "goal_reminder")
    assertEquals(goalReminder.body, "You have 2/5 commits today.")

    globalThis.fetch = originalFetch
  })

  await t.step("should queue streak_warning when user has streak but 0 commits today", async () => {
    const originalFetch = globalThis.fetch

    const now = new Date()
    const currentHH = now.toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    const inserted: unknown[] = []

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("notifications_enabled"),
        respond: () => jsonRes([{
          id: "user-1",
          daily_goal: 5,
          current_streak: 12,
          timezone: "UTC",
          notification_time: `${currentHH}:00`,
        }]),
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits"),
        respond: () => jsonRes(null), // no row = 0 commits
      },
      {
        match: (url) => url.includes("/rest/v1/notification_queue") && url.includes("select=type"),
        respond: () => jsonRes([]),
      },
      {
        match: (url, m) => url.includes("/rest/v1/notification_queue") && m === "POST",
        respond: (_url, init) => {
          inserted.push(JSON.parse(init?.body as string))
          return jsonRes(null, 201)
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    // Should queue both: goal_reminder (0/5) and streak_warning (12-day streak at risk)
    assertEquals(body.notificationsQueued, 2)

    const streakWarning = inserted.find((n: any) => n.type === "streak_warning") as any
    assertEquals(streakWarning.body, "Don't lose your 12-day streak!")

    globalThis.fetch = originalFetch
  })

  await t.step("should skip users outside their notification time window", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("notifications_enabled"),
        respond: () => jsonRes([{
          id: "user-1",
          daily_goal: 5,
          current_streak: 3,
          timezone: "UTC",
          notification_time: "03:00:00", // 3 AM — unlikely to match current test time
        }]),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.notificationsQueued, 0)

    globalThis.fetch = originalFetch
  })

  await t.step("should not duplicate notifications already sent today", async () => {
    const originalFetch = globalThis.fetch

    const now = new Date()
    const currentHH = now.toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    const inserted: unknown[] = []

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("notifications_enabled"),
        respond: () => jsonRes([{
          id: "user-1",
          daily_goal: 5,
          current_streak: 10,
          timezone: "UTC",
          notification_time: `${currentHH}:00`,
        }]),
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits"),
        respond: () => jsonRes(null), // 0 commits
      },
      {
        match: (url) => url.includes("/rest/v1/notification_queue") && url.includes("select=type"),
        respond: () => jsonRes([
          { type: "goal_reminder" },
          { type: "streak_warning" },
        ]), // already sent today
      },
      {
        match: (url, m) => url.includes("/rest/v1/notification_queue") && m === "POST",
        respond: (_url, init) => {
          inserted.push(JSON.parse(init?.body as string))
          return jsonRes(null, 201)
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.notificationsQueued, 0)
    assertEquals(inserted.length, 0)

    globalThis.fetch = originalFetch
  })

  await t.step("should not queue notifications when goal is already met", async () => {
    const originalFetch = globalThis.fetch

    const now = new Date()
    const currentHH = now.toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    const inserted: unknown[] = []

    globalThis.fetch = createFetchRouter([
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("notifications_enabled"),
        respond: () => jsonRes([{
          id: "user-1",
          daily_goal: 5,
          current_streak: 7,
          timezone: "UTC",
          notification_time: `${currentHH}:00`,
        }]),
      },
      {
        match: (url) => url.includes("/rest/v1/daily_commits"),
        respond: () => jsonRes({ commit_count: 8, goal_met: true }),
      },
      {
        match: (url) => url.includes("/rest/v1/notification_queue") && url.includes("select=type"),
        respond: () => jsonRes([]),
      },
      {
        match: (url, m) => url.includes("/rest/v1/notification_queue") && m === "POST",
        respond: (_url, init) => {
          inserted.push(JSON.parse(init?.body as string))
          return jsonRes(null, 201)
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST", headers: { Authorization: "Bearer service-key" },
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    // Goal met + has commits → no goal_reminder, no streak_warning
    assertEquals(body.notificationsQueued, 0)
    assertEquals(inserted.length, 0)

    globalThis.fetch = originalFetch
  })
}})
