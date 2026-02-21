// Integration tests for manage-friends Edge Function
// Run with: deno test supabase/functions/manage-friends/index.test.ts --allow-env

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
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
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

const USER_ID = "00000000-0000-0000-0000-000000000001"
const GH_USERNAME = "testuser"
const GH_TOKEN = "gho_fake"
const FRIEND_ID = "00000000-0000-0000-0000-000000000002"
const FRIENDSHIP_ID = "00000000-0000-0000-0000-000000000099"

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
      respond: () => jsonRes({ github_username: GH_USERNAME, timezone: "UTC" }),
    },
  ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test({ name: "manage-friends", sanitizeResources: false, sanitizeOps: false, fn: async (t) => {
  Deno.env.set("SUPABASE_URL", "http://localhost:54321")
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key")
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

  const { handler } = await import("./index.ts")

  await t.step("should reject unauthenticated requests with 401", async () => {
    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      body: JSON.stringify({ action: "send_request", friend_code: "ABCD-1234" }),
    }))
    assertEquals(res.status, 401)
  })

  await t.step("should handle CORS OPTIONS", async () => {
    const res = await handler(new Request("http://localhost/fn", { method: "OPTIONS" }))
    assertEquals(res.status, 200)
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  })

  await t.step("should return 400 for invalid action", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([...authRoutes()])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "invalid_action" }),
    }))

    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(body.error.includes("Invalid action"), true)

    globalThis.fetch = originalFetch
  })

  // --- send_request ---

  await t.step("send_request: should require friend_code", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = createFetchRouter([...authRoutes()])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "send_request" }),
    }))

    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(body.error, "friend_code is required")

    globalThis.fetch = originalFetch
  })

  await t.step("send_request: should return 404 for invalid friend code", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("friend_code"),
        respond: () => jsonRes({ error: "not found", code: "PGRST116" }, 406),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "send_request", friend_code: "INVALID" }),
    }))

    assertEquals(res.status, 404)
    const body = await res.json()
    assertEquals(body.error, "Invalid friend code")

    globalThis.fetch = originalFetch
  })

  await t.step("send_request: should prevent adding yourself", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("friend_code"),
        respond: () => jsonRes({ id: USER_ID }),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "send_request", friend_code: "SELF-CODE" }),
    }))

    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(body.error, "Cannot add yourself as a friend")

    globalThis.fetch = originalFetch
  })

  await t.step("send_request: should create friendship and queue notification", async () => {
    const originalFetch = globalThis.fetch

    let insertedFriendship: unknown = null
    let insertedNotification: unknown = null

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("friend_code"),
        respond: () => jsonRes({ id: FRIEND_ID }),
      },
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "GET",
        respond: () => jsonRes(null, 406), // no existing friendship (.single() returns error)
      },
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "POST",
        respond: (_url, init) => {
          insertedFriendship = JSON.parse(init?.body as string)
          return jsonRes({ id: FRIENDSHIP_ID }, 201)
        },
      },
      {
        match: (url, m) => url.includes("/rest/v1/notification_queue") && m === "POST",
        respond: (_url, init) => {
          insertedNotification = JSON.parse(init?.body as string)
          return jsonRes(null, 201)
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "send_request", friend_code: "ABCD-1234" }),
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.success, true)
    assertEquals(body.friendship_id, FRIENDSHIP_ID)

    // Verify friendship was created correctly
    assertEquals((insertedFriendship as any).requester_id, USER_ID)
    assertEquals((insertedFriendship as any).addressee_id, FRIEND_ID)
    assertEquals((insertedFriendship as any).status, "pending")

    // Verify notification was sent to addressee
    assertEquals((insertedNotification as any).user_id, FRIEND_ID)
    assertEquals((insertedNotification as any).type, "friend_request")
    assertEquals((insertedNotification as any).body.includes(GH_USERNAME), true)

    globalThis.fetch = originalFetch
  })

  await t.step("send_request: should return 409 if already friends", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url) => url.includes("/rest/v1/users") && url.includes("friend_code"),
        respond: () => jsonRes({ id: FRIEND_ID }),
      },
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "GET",
        respond: () => jsonRes({ id: FRIENDSHIP_ID, status: "accepted" }),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "send_request", friend_code: "ABCD-1234" }),
    }))

    assertEquals(res.status, 409)
    const body = await res.json()
    assertEquals(body.error, "Already friends")

    globalThis.fetch = originalFetch
  })

  // --- accept_request ---

  await t.step("accept_request: should require friendship_id", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = createFetchRouter([...authRoutes()])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "accept_request" }),
    }))

    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(body.error, "friendship_id is required")

    globalThis.fetch = originalFetch
  })

  await t.step("accept_request: should only allow addressee to accept", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "GET",
        respond: () => jsonRes({
          id: FRIENDSHIP_ID,
          requester_id: USER_ID, // user is the requester, not addressee
          addressee_id: FRIEND_ID,
          status: "pending",
        }),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "accept_request", friendship_id: FRIENDSHIP_ID }),
    }))

    assertEquals(res.status, 403)
    const body = await res.json()
    assertEquals(body.error, "Only the addressee can accept a request")

    globalThis.fetch = originalFetch
  })

  await t.step("accept_request: should accept pending request and check badges", async () => {
    const originalFetch = globalThis.fetch

    let updatedStatus: string | null = null

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && url.includes(`id=eq.${FRIENDSHIP_ID}`) && m === "GET",
        respond: () => jsonRes({
          id: FRIENDSHIP_ID,
          requester_id: FRIEND_ID,
          addressee_id: USER_ID, // user is the addressee
          status: "pending",
        }),
      },
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "PATCH",
        respond: (_url, init) => {
          updatedStatus = JSON.parse(init?.body as string).status
          return jsonRes(null)
        },
      },
      {
        // Badge check: count accepted friendships
        match: (url, m) => url.includes("/rest/v1/friendships") && url.includes("select=id") && m === "GET" && url.includes("head=true"),
        respond: () => new Response(null, { status: 200, headers: { "Content-Range": "0-0/1" } }),
      },
      {
        match: (url, m) => url.includes("/rest/v1/badges") && m === "GET",
        respond: () => jsonRes([
          { id: "badge-social-1", requirement_value: 1 },
          { id: "badge-social-10", requirement_value: 10 },
        ]),
      },
      {
        match: (url, m) => url.includes("/rest/v1/user_badges") && m === "POST",
        respond: () => jsonRes(null, 201),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "accept_request", friendship_id: FRIENDSHIP_ID }),
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.success, true)
    assertEquals(updatedStatus, "accepted")

    globalThis.fetch = originalFetch
  })

  // --- reject_request ---

  await t.step("reject_request: should reject pending request", async () => {
    const originalFetch = globalThis.fetch

    let updatedStatus: string | null = null

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "GET",
        respond: () => jsonRes({
          id: FRIENDSHIP_ID,
          requester_id: FRIEND_ID,
          addressee_id: USER_ID,
          status: "pending",
        }),
      },
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "PATCH",
        respond: (_url, init) => {
          updatedStatus = JSON.parse(init?.body as string).status
          return jsonRes(null)
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "reject_request", friendship_id: FRIENDSHIP_ID }),
    }))

    assertEquals(res.status, 200)
    assertEquals(updatedStatus, "rejected")

    globalThis.fetch = originalFetch
  })

  await t.step("reject_request: should return 409 if already accepted", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "GET",
        respond: () => jsonRes({
          id: FRIENDSHIP_ID,
          requester_id: FRIEND_ID,
          addressee_id: USER_ID,
          status: "accepted",
        }),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "reject_request", friendship_id: FRIENDSHIP_ID }),
    }))

    assertEquals(res.status, 409)
    const body = await res.json()
    assertEquals(body.error, "Request is already accepted")

    globalThis.fetch = originalFetch
  })

  // --- remove_friend ---

  await t.step("remove_friend: should require friend_id", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = createFetchRouter([...authRoutes()])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "remove_friend" }),
    }))

    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(body.error, "friend_id is required")

    globalThis.fetch = originalFetch
  })

  await t.step("remove_friend: should delete accepted friendship", async () => {
    const originalFetch = globalThis.fetch

    let deleteCalled = false

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "DELETE",
        respond: () => {
          deleteCalled = true
          return new Response(null, {
            status: 200,
            headers: { "Content-Range": "0-0/1" },
          })
        },
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "remove_friend", friend_id: FRIEND_ID }),
    }))

    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.success, true)
    assertEquals(deleteCalled, true)

    globalThis.fetch = originalFetch
  })

  await t.step("remove_friend: should return 404 if friendship not found", async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = createFetchRouter([
      ...authRoutes(),
      {
        match: (url, m) => url.includes("/rest/v1/friendships") && m === "DELETE",
        respond: () => new Response(null, {
          status: 200,
          headers: { "Content-Range": "*/0" },
        }),
      },
    ])

    const res = await handler(new Request("http://localhost/fn", {
      method: "POST",
      headers: { Authorization: "Bearer jwt" },
      body: JSON.stringify({ action: "remove_friend", friend_id: "nonexistent" }),
    }))

    assertEquals(res.status, 404)

    globalThis.fetch = originalFetch
  })
}})
