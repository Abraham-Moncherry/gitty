import { render, screen, waitFor } from "@testing-library/react"

const { mockUseAuth, mockUseStats, mockSupabase, chainable } = vi.hoisted(() => {
  function chainable(response = { data: null, error: null }) {
    const chain: any = {}
    for (const m of ["select", "insert", "update", "delete", "eq", "neq", "gte", "lte", "in", "or", "order", "limit"]) {
      chain[m] = vi.fn(() => chain)
    }
    chain.single = vi.fn(() => Promise.resolve(response))
    chain.then = (resolve: Function) => Promise.resolve(response).then(resolve as any)
    return chain
  }
  return {
    mockUseAuth: vi.fn(),
    mockUseStats: vi.fn(),
    mockSupabase: {
      from: vi.fn(() => chainable()),
      auth: { getSession: vi.fn(), signOut: vi.fn() },
      functions: { invoke: vi.fn() }
    },
    chainable
  }
})

vi.mock("~contexts/SupabaseAuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: any) => children
}))

vi.mock("~contexts/StatsContext", () => ({
  useStats: mockUseStats,
  StatsProvider: ({ children }: any) => children
}))

vi.mock("~lib/supabase", () => ({ supabase: mockSupabase }))

import { BadgesPage } from "~popup/pages/BadgesPage"

describe("BadgesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: {
        id: "user-123",
        current_streak: 7
      }
    })
    mockUseStats.mockReturnValue({
      stats: {
        todayCommits: 3,
        totalScore: 142
      }
    })
  })

  it("shows loading state initially", () => {
    // When supabase queries are still pending, loading is true
    const neverResolve = chainable(
      new Promise(() => {}) as any
    )
    // Override: make from return a chain that never resolves
    mockSupabase.from.mockReturnValue(neverResolve)

    render(<BadgesPage />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders badges with name, description, icon", async () => {
    const badgesChain = chainable({
      data: [
        { id: "b1", slug: "first-commit", name: "First Blood", description: "Make your first commit", icon: "🎯", category: "commits", requirement_type: "total_commits", requirement_value: 1, created_at: "2026-01-01" },
        { id: "b2", slug: "streak-7", name: "Week Warrior", description: "Maintain a 7-day streak", icon: "🔥", category: "streaks", requirement_type: "streak", requirement_value: 7, created_at: "2026-01-01" }
      ],
      error: null
    })
    const earnedChain = chainable({
      data: [{ badge_id: "b1", earned_at: "2026-02-01T00:00:00Z" }],
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "badges") return badgesChain
      if (table === "user_badges") return earnedChain
      return chainable()
    })

    render(<BadgesPage />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    expect(screen.getByText("First Blood")).toBeInTheDocument()
    expect(screen.getByText("Make your first commit")).toBeInTheDocument()
    expect(screen.getByText("🎯")).toBeInTheDocument()

    expect(screen.getByText("Week Warrior")).toBeInTheDocument()
    expect(screen.getByText("Maintain a 7-day streak")).toBeInTheDocument()
    expect(screen.getByText("🔥")).toBeInTheDocument()
  })

  it("shows progress text for unearned badges", async () => {
    const badgesChain = chainable({
      data: [
        { id: "b1", slug: "first-commit", name: "First Blood", description: "Make your first commit", icon: "🎯", category: "commits", requirement_type: "total_commits", requirement_value: 1, created_at: "2026-01-01" },
        { id: "b2", slug: "streak-30", name: "Monthly Master", description: "Maintain a 30-day streak", icon: "🏆", category: "streaks", requirement_type: "streak", requirement_value: 30, created_at: "2026-01-01" }
      ],
      error: null
    })
    const earnedChain = chainable({
      data: [{ badge_id: "b1", earned_at: "2026-02-01T00:00:00Z" }],
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "badges") return badgesChain
      if (table === "user_badges") return earnedChain
      return chainable()
    })

    render(<BadgesPage />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    // Unearned badge should show progress text (current_streak=7, requirement=30)
    expect(screen.getByText("7/30")).toBeInTheDocument()
  })

  it("shows earned count header", async () => {
    const badgesChain = chainable({
      data: [
        { id: "b1", slug: "first-commit", name: "First Blood", description: "Make your first commit", icon: "🎯", category: "commits", requirement_type: "total_commits", requirement_value: 1, created_at: "2026-01-01" },
        { id: "b2", slug: "streak-7", name: "Week Warrior", description: "7-day streak", icon: "🔥", category: "streaks", requirement_type: "streak", requirement_value: 7, created_at: "2026-01-01" },
        { id: "b3", slug: "streak-30", name: "Monthly Master", description: "30-day streak", icon: "🏆", category: "streaks", requirement_type: "streak", requirement_value: 30, created_at: "2026-01-01" }
      ],
      error: null
    })
    const earnedChain = chainable({
      data: [
        { badge_id: "b1", earned_at: "2026-02-01T00:00:00Z" },
        { badge_id: "b2", earned_at: "2026-02-10T00:00:00Z" }
      ],
      error: null
    })

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "badges") return badgesChain
      if (table === "user_badges") return earnedChain
      return chainable()
    })

    render(<BadgesPage />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    // Header should show "Earned (2/3)"
    expect(screen.getByText("Earned (2/3)")).toBeInTheDocument()
  })

  it("does not fetch badges when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null })
    render(<BadgesPage />)

    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
