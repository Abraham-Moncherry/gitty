import { renderHook, act, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockSupabase, mockClearAllCache } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn()
  return {
    mockSupabase: {
      from: vi.fn(),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: mockUnsubscribe } }
        }),
        signInWithOAuth: vi.fn(),
        setSession: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null })
      },
      functions: { invoke: vi.fn() }
    },
    mockClearAllCache: vi.fn().mockResolvedValue(undefined)
  }
})

vi.mock("~lib/supabase", () => ({ supabase: mockSupabase }))

vi.mock("~lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~lib/storage")>()
  return {
    ...actual,
    clearAllCache: mockClearAllCache
  }
})

// Import AFTER mocks are registered -- we test this context directly
import { AuthProvider, useAuth } from "~contexts/SupabaseAuthContext"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainable(
  response: { data: unknown; error: unknown } = { data: null, error: null }
) {
  const chain: Record<string, any> = {}
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "neq", "gte", "lte", "in", "or",
    "order", "limit"
  ]
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.single = vi.fn(() => Promise.resolve(response))
  chain.then = (resolve: Function) =>
    Promise.resolve(response).then(resolve as any)
  return chain
}

function makeUserProfile() {
  return {
    id: "user-123",
    github_username: "testuser",
    avatar_url: null,
    display_name: "Test User",
    daily_goal: 5,
    notifications_enabled: true,
    notification_time: "09:00",
    timezone: "America/New_York",
    total_commits: 100,
    historical_commits: 50,
    current_streak: 7,
    longest_streak: 14,
    friend_code: "ABC123",
    backfill_completed: true,
    backfill_started_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-06-01T00:00:00Z"
  }
}

function makeSession(userId = "user-123") {
  return {
    user: { id: userId, email: "test@test.com" },
    access_token: "access-tok",
    refresh_token: "refresh-tok"
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SupabaseAuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no session on mount
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null }
    })
    const mockUnsubscribe = vi.fn()
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } }
    })
    mockSupabase.auth.signOut.mockResolvedValue({ error: null })
    mockClearAllCache.mockResolvedValue(undefined)
  })

  // ---- useAuth outside provider -----------------------------------------
  it("useAuth throws when used outside AuthProvider", () => {
    expect(() => {
      renderHook(() => useAuth())
    }).toThrow("useAuth must be used within AuthProvider")
  })

  // ---- Calls getSession on mount ----------------------------------------
  it("calls getSession on mount", () => {
    renderHook(() => useAuth(), { wrapper })

    expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1)
  })

  // ---- Sets session when getSession returns valid session ---------------
  it("sets session when getSession returns valid session", async () => {
    const session = makeSession()
    const userProfile = makeUserProfile()

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session }
    })

    const usersChain = chainable({ data: userProfile, error: null })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "users") return usersChain
      return chainable()
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.session).toBe(session)
    expect(result.current.user).toEqual(userProfile)
    expect(result.current.supabaseUser).toBe(session.user)
  })

  // ---- Sets loading=false when no session -------------------------------
  it("sets loading=false when no session", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null }
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.session).toBeNull()
    expect(result.current.user).toBeNull()
    expect(result.current.supabaseUser).toBeNull()
  })

  // ---- Subscribes to onAuthStateChange and unsubscribes on unmount ------
  it("subscribes to onAuthStateChange and unsubscribes on unmount", () => {
    const mockUnsubscribe = vi.fn()
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } }
    })

    const { unmount } = renderHook(() => useAuth(), { wrapper })

    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalledWith(
      expect.any(Function)
    )

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  // ---- signOut clears everything ----------------------------------------
  it("signOut calls supabase.auth.signOut, clears session/user, calls clearAllCache", async () => {
    const session = makeSession()
    const userProfile = makeUserProfile()

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session }
    })

    const usersChain = chainable({ data: userProfile, error: null })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "users") return usersChain
      return chainable()
    })

    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for initial load to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.user).not.toBeNull()
    })

    // Now sign out
    await act(async () => {
      await result.current.signOut()
    })

    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1)
    expect(mockClearAllCache).toHaveBeenCalledTimes(1)
    expect(result.current.session).toBeNull()
    expect(result.current.user).toBeNull()
  })

  // ---- signInWithGitHub flow --------------------------------------------
  it("signInWithGitHub calls chrome.identity and supabase auth flow", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null }
    })

    const oauthUrl = "https://supabase.test/auth/v1/authorize?provider=github"
    mockSupabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: oauthUrl },
      error: null
    })
    mockSupabase.auth.setSession.mockResolvedValue({
      data: { session: makeSession() },
      error: null
    })

    const callbackUrl =
      "https://test.chromiumapp.org/#access_token=my-access-token&refresh_token=my-refresh-token&token_type=bearer"

    ;(chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>).mockImplementation(
      (_opts: unknown, cb: Function) => {
        cb(callbackUrl)
      }
    )

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await act(async () => {
      await result.current.signInWithGitHub()
    })

    // Should have called signInWithOAuth with github provider
    expect(mockSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: {
        redirectTo: "https://test.chromiumapp.org/",
        skipBrowserRedirect: true
      }
    })

    // Should have launched web auth flow
    expect(chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith(
      { url: oauthUrl, interactive: true },
      expect.any(Function)
    )

    // Should have set session with extracted tokens
    expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "my-access-token",
      refresh_token: "my-refresh-token"
    })
  })
})
