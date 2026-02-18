import { renderHook, act, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockSupabase,
  mockUseAuth,
  mockGetCachedLeaderboard,
  mockSetCachedLeaderboard
} = vi.hoisted(() => {
  return {
    mockSupabase: {
      from: vi.fn(),
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signInWithOAuth: vi.fn(),
        setSession: vi.fn(),
        signOut: vi.fn()
      },
      functions: { invoke: vi.fn() }
    },
    mockUseAuth: vi.fn(),
    mockGetCachedLeaderboard: vi.fn(),
    mockSetCachedLeaderboard: vi.fn()
  }
})

vi.mock("~lib/supabase", () => ({ supabase: mockSupabase }))

vi.mock("~contexts/SupabaseAuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children
}))

vi.mock("~lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~lib/storage")>()
  return {
    ...actual,
    getCachedLeaderboard: mockGetCachedLeaderboard,
    setCachedLeaderboard: mockSetCachedLeaderboard
  }
})

// Import AFTER mocks are registered
import {
  LeaderboardProvider,
  useLeaderboard
} from "~contexts/LeaderboardContext"

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

function makeUser(overrides: Record<string, unknown> = {}) {
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
    updated_at: "2025-06-01T00:00:00Z",
    ...overrides
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <LeaderboardProvider>{children}</LeaderboardProvider>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LeaderboardContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCachedLeaderboard.mockResolvedValue(null)
    mockSetCachedLeaderboard.mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({ user: null, session: null })
  })

  // ---- useLeaderboard outside provider ----------------------------------
  it("useLeaderboard throws when used outside LeaderboardProvider", () => {
    expect(() => {
      renderHook(() => useLeaderboard())
    }).toThrow("useLeaderboard must be used within LeaderboardProvider")
  })

  // ---- Default values ---------------------------------------------------
  it("has correct default values: period=weekly, scope=global, leaderboard=null, loading=false", () => {
    const { result } = renderHook(() => useLeaderboard(), { wrapper })

    expect(result.current.period).toBe("weekly")
    expect(result.current.scope).toBe("global")
    expect(result.current.leaderboard).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  // ---- refreshLeaderboard when user is null -----------------------------
  it("refreshLeaderboard does nothing when user is null", async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null })

    const { result } = renderHook(() => useLeaderboard(), { wrapper })

    await act(async () => {
      await result.current.refreshLeaderboard()
    })

    expect(mockSupabase.from).not.toHaveBeenCalled()
    expect(result.current.leaderboard).toBeNull()
  })

  // ---- refreshLeaderboard queries leaderboard_cache with period ---------
  it("refreshLeaderboard queries leaderboard_cache with period filter", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: {} })

    const leaderboardChain = chainable({
      data: [
        {
          user_id: "u1",
          score: 100,
          rank: 1,
          users: {
            display_name: "Alice",
            github_username: "alice",
            avatar_url: "https://avatar.test/alice"
          }
        }
      ],
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "leaderboard_cache") return leaderboardChain
      return chainable()
    })

    const { result } = renderHook(() => useLeaderboard(), { wrapper })

    await act(async () => {
      await result.current.refreshLeaderboard()
    })

    expect(mockSupabase.from).toHaveBeenCalledWith("leaderboard_cache")
    expect(leaderboardChain.eq).toHaveBeenCalledWith("period", "weekly")
    expect(leaderboardChain.order).toHaveBeenCalledWith("rank", {
      ascending: true
    })
    expect(leaderboardChain.limit).toHaveBeenCalledWith(50)
  })

  // ---- Friends scope: queries friendships first -------------------------
  it("for friends scope, queries friendships first then filters leaderboard by IDs", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: {} })

    const friendshipsChain = chainable({
      data: [
        { requester_id: "user-123", addressee_id: "friend-1" },
        { requester_id: "friend-2", addressee_id: "user-123" }
      ],
      error: null
    })

    const leaderboardChain = chainable({
      data: [
        {
          user_id: "user-123",
          score: 50,
          rank: 2,
          users: {
            display_name: "Test User",
            github_username: "testuser",
            avatar_url: null
          }
        }
      ],
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "friendships") return friendshipsChain
      if (table === "leaderboard_cache") return leaderboardChain
      return chainable()
    })

    const { result } = renderHook(() => useLeaderboard(), { wrapper })

    // First set scope to "friends"
    act(() => {
      result.current.setScope("friends")
    })

    await act(async () => {
      await result.current.refreshLeaderboard()
    })

    expect(mockSupabase.from).toHaveBeenCalledWith("friendships")
    expect(friendshipsChain.or).toHaveBeenCalledWith(
      `requester_id.eq.user-123,addressee_id.eq.user-123`
    )
    expect(friendshipsChain.eq).toHaveBeenCalledWith("status", "accepted")

    // Should filter leaderboard by friend IDs + self
    expect(leaderboardChain.in).toHaveBeenCalledWith("user_id", [
      "friend-1",
      "friend-2",
      "user-123"
    ])
  })

  // ---- Maps result rows to correct entry format -------------------------
  it("maps result rows to correct entry format", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: {} })

    const leaderboardChain = chainable({
      data: [
        {
          user_id: "u1",
          score: 200,
          rank: 1,
          users: {
            display_name: "Alice",
            github_username: "alice",
            avatar_url: "https://avatar.test/alice"
          }
        },
        {
          user_id: "u2",
          score: 150,
          rank: 2,
          users: {
            display_name: null,
            github_username: "bob",
            avatar_url: null
          }
        }
      ],
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "leaderboard_cache") return leaderboardChain
      return chainable()
    })

    const { result } = renderHook(() => useLeaderboard(), { wrapper })

    await act(async () => {
      await result.current.refreshLeaderboard()
    })

    expect(result.current.leaderboard).not.toBeNull()
    const entries = result.current.leaderboard!.entries
    expect(entries).toHaveLength(2)

    expect(entries[0]).toEqual({
      userId: "u1",
      displayName: "Alice",
      githubUsername: "alice",
      avatarUrl: "https://avatar.test/alice",
      score: 200,
      rank: 1
    })

    expect(entries[1]).toEqual({
      userId: "u2",
      displayName: null,
      githubUsername: "bob",
      avatarUrl: null,
      score: 150,
      rank: 2
    })
  })

  // ---- Calls setCachedLeaderboard after refresh -------------------------
  it("calls setCachedLeaderboard after refresh", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: {} })

    const leaderboardChain = chainable({
      data: [
        {
          user_id: "u1",
          score: 100,
          rank: 1,
          users: {
            display_name: "Alice",
            github_username: "alice",
            avatar_url: null
          }
        }
      ],
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "leaderboard_cache") return leaderboardChain
      return chainable()
    })

    const { result } = renderHook(() => useLeaderboard(), { wrapper })

    await act(async () => {
      await result.current.refreshLeaderboard()
    })

    expect(mockSetCachedLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({
        period: "weekly",
        scope: "global",
        entries: expect.arrayContaining([
          expect.objectContaining({ userId: "u1", score: 100, rank: 1 })
        ]),
        lastFetched: expect.any(Number)
      })
    )
  })

  // ---- setPeriod and setScope update state ------------------------------
  it("setPeriod and setScope update state", () => {
    const { result } = renderHook(() => useLeaderboard(), { wrapper })

    expect(result.current.period).toBe("weekly")
    expect(result.current.scope).toBe("global")

    act(() => {
      result.current.setPeriod("monthly")
    })
    expect(result.current.period).toBe("monthly")

    act(() => {
      result.current.setScope("friends")
    })
    expect(result.current.scope).toBe("friends")

    act(() => {
      result.current.setPeriod("all_time")
    })
    expect(result.current.period).toBe("all_time")
  })
})
