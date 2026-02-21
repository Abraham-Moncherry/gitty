import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { fetchUserEvents, fetchContributionsGraphQL, GitHubError } from "./github.ts"

// Save original fetch to restore after each test
const originalFetch = globalThis.fetch

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    return Promise.resolve(handler(url, init))
  }
}

function restoreFetch() {
  globalThis.fetch = originalFetch
}

Deno.test("fetchUserEvents", async (t) => {
  await t.step("fetches push events from correct URL", async () => {
    let capturedUrl = ""
    let capturedHeaders: Record<string, string> = {}

    mockFetch((url, init) => {
      capturedUrl = url
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {})
      )
      return new Response(JSON.stringify([]), { status: 200 })
    })

    await fetchUserEvents("testuser", "gh-token-123")

    assertEquals(capturedUrl, "https://api.github.com/users/testuser/events?per_page=100")
    assertEquals(capturedHeaders["Authorization"], "Bearer gh-token-123")
    assertEquals(capturedHeaders["User-Agent"], "Gitty-Extension")

    restoreFetch()
  })

  await t.step("returns parsed events array", async () => {
    const fakeEvents = [
      { id: "1", type: "PushEvent", repo: { name: "user/repo" }, payload: { commits: [] }, created_at: "2026-02-21T10:00:00Z" },
    ]
    mockFetch(() => new Response(JSON.stringify(fakeEvents), { status: 200 }))

    const result = await fetchUserEvents("testuser", "token")
    assertEquals(result.length, 1)
    assertEquals(result[0].type, "PushEvent")

    restoreFetch()
  })

  await t.step("throws GitHubError on 401 (expired token)", async () => {
    mockFetch(() => new Response("Unauthorized", { status: 401 }))

    await assertRejects(
      () => fetchUserEvents("testuser", "bad-token"),
      GitHubError,
      "GitHub token expired"
    )

    restoreFetch()
  })

  await t.step("throws GitHubError on 403 (rate limit)", async () => {
    mockFetch(() => new Response("Forbidden", {
      status: 403,
      headers: { "X-RateLimit-Remaining": "0" },
    }))

    await assertRejects(
      () => fetchUserEvents("testuser", "token"),
      GitHubError,
      "rate limited"
    )

    restoreFetch()
  })
})

Deno.test("fetchContributionsGraphQL", async (t) => {
  await t.step("sends POST to GraphQL endpoint with correct body", async () => {
    let capturedBody = ""

    mockFetch((_url, init) => {
      capturedBody = init?.body as string
      return new Response(JSON.stringify({ data: { user: {} } }), { status: 200 })
    })

    const query = "query { user { login } }"
    const variables = { username: "testuser" }

    await fetchContributionsGraphQL("testuser", "token", query, variables)

    const parsed = JSON.parse(capturedBody)
    assertEquals(parsed.query, query)
    assertEquals(parsed.variables, variables)

    restoreFetch()
  })

  await t.step("returns data field from response", async () => {
    const fakeData = { user: { contributionsCollection: { totalContributions: 42 } } }

    mockFetch(() => new Response(JSON.stringify({ data: fakeData }), { status: 200 }))

    const result = await fetchContributionsGraphQL("testuser", "token", "query", {})
    assertEquals(result, fakeData)

    restoreFetch()
  })

  await t.step("throws on GraphQL errors in response", async () => {
    mockFetch(() => new Response(JSON.stringify({
      errors: [{ message: "Not Found" }],
    }), { status: 200 }))

    await assertRejects(
      () => fetchContributionsGraphQL("testuser", "token", "query", {}),
      GitHubError,
      "Not Found"
    )

    restoreFetch()
  })

  await t.step("throws GitHubError on 401", async () => {
    mockFetch(() => new Response("Unauthorized", { status: 401 }))

    await assertRejects(
      () => fetchContributionsGraphQL("testuser", "bad-token", "query", {}),
      GitHubError,
      "GitHub token expired"
    )

    restoreFetch()
  })
})
