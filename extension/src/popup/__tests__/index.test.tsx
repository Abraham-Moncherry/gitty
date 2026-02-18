import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockUseAuth, mockUseStats, mockUseLeaderboard } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseStats: vi.fn(),
  mockUseLeaderboard: vi.fn()
}))

vi.mock("~contexts/SupabaseAuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: any) => children
}))

vi.mock("~contexts/StatsContext", () => ({
  useStats: mockUseStats,
  StatsProvider: ({ children }: any) => children
}))

vi.mock("~contexts/LeaderboardContext", () => ({
  useLeaderboard: mockUseLeaderboard,
  LeaderboardProvider: ({ children }: any) => children
}))

// Mock the CSS import to avoid errors
vi.mock("~styles/globals.css", () => ({}))

import Popup from "~popup/index"

describe("Popup (popup/index.tsx)", () => {
  const mockSignOut = vi.fn()
  const mockRefreshLeaderboard = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseStats.mockReturnValue({
      stats: null,
      loading: false,
      refreshStats: vi.fn()
    })
    mockUseLeaderboard.mockReturnValue({
      leaderboard: null,
      loading: false,
      period: "weekly",
      scope: "global",
      setPeriod: vi.fn(),
      setScope: vi.fn(),
      refreshLeaderboard: mockRefreshLeaderboard
    })
  })

  it("shows loading when auth is loading", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      loading: true,
      signOut: mockSignOut
    })

    render(<Popup />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("shows LoginPage when no session", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      loading: false,
      signOut: mockSignOut,
      signInWithGitHub: vi.fn()
    })

    render(<Popup />)

    expect(screen.getByText("Gitty")).toBeInTheDocument()
    expect(screen.getByText("Sign in with GitHub")).toBeInTheDocument()
  })

  it("shows error with sign-out when session exists but no user", async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      session: { access_token: "tok", user: { id: "user-123" } },
      user: null,
      loading: false,
      signOut: mockSignOut
    })

    render(<Popup />)

    expect(
      screen.getByText(/your profile couldn't be loaded/i)
    ).toBeInTheDocument()

    const signOutButton = screen.getByRole("button", { name: /sign out/i })
    expect(signOutButton).toBeInTheDocument()

    await user.click(signOutButton)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it("shows HomePage and TabBar when authenticated with user", () => {
    mockUseAuth.mockReturnValue({
      session: { access_token: "tok", user: { id: "user-123" } },
      user: {
        id: "user-123",
        github_username: "testuser",
        daily_goal: 5,
        current_streak: 7
      },
      loading: false,
      signOut: mockSignOut
    })
    mockUseStats.mockReturnValue({
      stats: {
        todayCommits: 3,
        dailyGoal: 5,
        goalMet: false,
        currentStreak: 7,
        longestStreak: 14,
        totalScore: 142,
        weeklyCommits: [],
        rank: 42,
        lastFetched: Date.now()
      },
      loading: false,
      refreshStats: vi.fn()
    })

    render(<Popup />)

    // TabBar should be visible
    expect(screen.getByText("Home")).toBeInTheDocument()
    expect(screen.getByText("Board")).toBeInTheDocument()
    expect(screen.getByText("Badge")).toBeInTheDocument()
    expect(screen.getByText("Me")).toBeInTheDocument()

    // HomePage content should be visible
    expect(screen.getByText("7-day streak")).toBeInTheDocument()
  })
})
