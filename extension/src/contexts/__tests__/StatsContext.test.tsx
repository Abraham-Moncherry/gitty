import { renderHook, act, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockSupabase, mockUseAuth, mockGetCachedStats, mockSetCachedStats } =
  vi.hoisted(() => {
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
      mockGetCachedStats: vi.fn(),
      mockSetCachedStats: vi.fn()
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
    getCachedStats: mockGetCachedStats,
    setCachedStats: mockSetCachedStats
  }
})

// Import AFTER mocks are registered
import { StatsProvider, useStats } from "~contexts/StatsContext"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a chainable query-builder mock. Every method returns `this` for
 *  chaining; `single()` and thenable resolution both resolve to `response`. */
function chainable(response: { data: unknown; error: unknown } = { data: null, error: null }) {
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
  chain.then = (resolve: Function) => Promise.resolve(response).then(resolve as any)
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

const fakeSession = { user: { id: "user-123" }, access_token: "tok", refresh_token: "ref" }

function wrapper({ children }: { children: ReactNode }) {
  return <StatsProvider>{children}</StatsProvider>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StatsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCachedStats.mockResolvedValue(null)
    mockSetCachedStats.mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({ user: null, session: null })
  })

  // ---- useStats outside provider ----------------------------------------
  it("useStats throws when used outside StatsProvider", () => {
    expect(() => {
      renderHook(() => useStats())
    }).toThrow("useStats must be used within StatsProvider")
  })

  // ---- No user ----------------------------------------------------------
  it("sets stats to null and loading=false when user is null", async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null })

    const { result } = renderHook(() => useStats(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.stats).toBeNull()
  })

  // ---- Full refresh with user + session ---------------------------------
  it("calls refreshStats and produces correct stats shape when user+session exist", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: fakeSession })

    const dailyCommitsChain = chainable({
      data: { commit_count: 3, goal_met: false },
      error: null
    })
    const weeklyCommitsChain = chainable({
      data: [
        { date: "2026-02-16", commit_count: 2 },
        { date: "2026-02-17", commit_count: 4 }
      ],
      error: null
    })
    const leaderboardCacheChain = chainable({
      data: { rank: 10 },
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "daily_commits") {
        // First call is for today (uses .single()), second is for the week (uses thenable)
        // We differentiate by returning a chain that tracks which path is taken.
        // Both paths go through the same chain; the code calls .single() for today
        // and iterates via thenable for the week. We'll return separate chains per call.
        const callCount = mockSupabase.from.mock.calls.filter(
          (c: string[]) => c[0] === "daily_commits"
        ).length
        return callCount <= 1 ? dailyCommitsChain : weeklyCommitsChain
      }
      if (table === "leaderboard_cache") return leaderboardCacheChain
      return chainable()
    })

    const { result } = renderHook(() => useStats(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.stats).not.toBeNull()
    })

    const stats = result.current.stats!
    expect(stats.todayCommits).toBe(3)
    expect(stats.dailyGoal).toBe(5)
    expect(stats.goalMet).toBe(false)
    expect(stats.currentStreak).toBe(7)
    expect(stats.longestStreak).toBe(14)
    expect(stats.totalScore).toBe(150) // 100 + 50
    expect(stats.rank).toBe(10)
    expect(stats.weeklyCommits).toEqual([
      { date: "2026-02-16", count: 2 },
      { date: "2026-02-17", count: 4 }
    ])
    expect(stats.lastFetched).toBeGreaterThan(0)
  })

  // ---- Cached stats for fast paint --------------------------------------
  it("uses getCachedStats for fast paint before fresh fetch", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: fakeSession })

    const cachedStats = {
      todayCommits: 1,
      dailyGoal: 5,
      goalMet: false,
      currentStreak: 2,
      longestStreak: 10,
      totalScore: 50,
      weeklyCommits: [],
      rank: 99,
      lastFetched: 1000
    }
    mockGetCachedStats.mockResolvedValue(cachedStats)

    // Fresh data from supabase
    const dailyChain = chainable({ data: { commit_count: 5, goal_met: true }, error: null })
    const weekChain = chainable({ data: [], error: null })
    const rankChain = chainable({ data: { rank: 42 }, error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      const callCount = mockSupabase.from.mock.calls.filter(
        (c: string[]) => c[0] === table
      ).length
      if (table === "daily_commits") {
        return callCount <= 1 ? dailyChain : weekChain
      }
      if (table === "leaderboard_cache") return rankChain
      return chainable()
    })

    const { result } = renderHook(() => useStats(), { wrapper })

    // The cached stats should appear first
    await waitFor(() => {
      expect(result.current.stats).not.toBeNull()
    })

    expect(mockGetCachedStats).toHaveBeenCalled()

    // Eventually the fresh data overwrites
    await waitFor(() => {
      expect(result.current.stats!.todayCommits).toBe(5)
    })
  })

  // ---- null todayData defaults -----------------------------------------
  it("handles null todayData (defaults to 0 commits, goalMet=false)", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: fakeSession })

    const nullTodayChain = chainable({ data: null, error: null })
    const weekChain = chainable({ data: [], error: null })
    const rankChain = chainable({ data: { rank: 1 }, error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      const callCount = mockSupabase.from.mock.calls.filter(
        (c: string[]) => c[0] === table
      ).length
      if (table === "daily_commits") {
        return callCount <= 1 ? nullTodayChain : weekChain
      }
      if (table === "leaderboard_cache") return rankChain
      return chainable()
    })

    const { result } = renderHook(() => useStats(), { wrapper })

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull()
    })

    expect(result.current.stats!.todayCommits).toBe(0)
    expect(result.current.stats!.goalMet).toBe(false)
  })

  // ---- null weekData defaults ------------------------------------------
  it("handles null weekData (defaults to empty array)", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: fakeSession })

    const todayChain = chainable({ data: { commit_count: 1, goal_met: false }, error: null })
    const nullWeekChain = chainable({ data: null, error: null })
    const rankChain = chainable({ data: { rank: 5 }, error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      const callCount = mockSupabase.from.mock.calls.filter(
        (c: string[]) => c[0] === table
      ).length
      if (table === "daily_commits") {
        return callCount <= 1 ? todayChain : nullWeekChain
      }
      if (table === "leaderboard_cache") return rankChain
      return chainable()
    })

    const { result } = renderHook(() => useStats(), { wrapper })

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull()
    })

    expect(result.current.stats!.weeklyCommits).toEqual([])
  })

  // ---- null rankData defaults ------------------------------------------
  it("handles null rankData (defaults to rank=null)", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: fakeSession })

    const todayChain = chainable({ data: { commit_count: 2, goal_met: false }, error: null })
    const weekChain = chainable({ data: [], error: null })
    const nullRankChain = chainable({ data: null, error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      const callCount = mockSupabase.from.mock.calls.filter(
        (c: string[]) => c[0] === table
      ).length
      if (table === "daily_commits") {
        return callCount <= 1 ? todayChain : weekChain
      }
      if (table === "leaderboard_cache") return nullRankChain
      return chainable()
    })

    const { result } = renderHook(() => useStats(), { wrapper })

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull()
    })

    expect(result.current.stats!.rank).toBeNull()
  })

  // ---- totalScore calculation ------------------------------------------
  it("calculates totalScore as total_commits + historical_commits", async () => {
    const user = makeUser({ total_commits: 200, historical_commits: 300 })
    mockUseAuth.mockReturnValue({ user, session: fakeSession })

    const todayChain = chainable({ data: { commit_count: 0, goal_met: false }, error: null })
    const weekChain = chainable({ data: [], error: null })
    const rankChain = chainable({ data: { rank: 1 }, error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      const callCount = mockSupabase.from.mock.calls.filter(
        (c: string[]) => c[0] === table
      ).length
      if (table === "daily_commits") {
        return callCount <= 1 ? todayChain : weekChain
      }
      if (table === "leaderboard_cache") return rankChain
      return chainable()
    })

    const { result } = renderHook(() => useStats(), { wrapper })

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull()
    })

    expect(result.current.stats!.totalScore).toBe(500)
  })

  // ---- setCachedStats is called after refresh --------------------------
  it("calls setCachedStats after refresh", async () => {
    const user = makeUser()
    mockUseAuth.mockReturnValue({ user, session: fakeSession })

    const todayChain = chainable({ data: { commit_count: 1, goal_met: false }, error: null })
    const weekChain = chainable({ data: [], error: null })
    const rankChain = chainable({ data: { rank: 3 }, error: null })

    mockSupabase.from.mockImplementation((table: string) => {
      const callCount = mockSupabase.from.mock.calls.filter(
        (c: string[]) => c[0] === table
      ).length
      if (table === "daily_commits") {
        return callCount <= 1 ? todayChain : weekChain
      }
      if (table === "leaderboard_cache") return rankChain
      return chainable()
    })

    const { result } = renderHook(() => useStats(), { wrapper })

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull()
    })

    expect(mockSetCachedStats).toHaveBeenCalledWith(
      expect.objectContaining({
        todayCommits: 1,
        dailyGoal: 5,
        goalMet: false,
        rank: 3
      })
    )
  })
})
