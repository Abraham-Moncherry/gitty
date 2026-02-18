import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockUseAuth, mockUseLeaderboard } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseLeaderboard: vi.fn()
}))

vi.mock("~contexts/SupabaseAuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: any) => children
}))

vi.mock("~contexts/LeaderboardContext", () => ({
  useLeaderboard: mockUseLeaderboard,
  LeaderboardProvider: ({ children }: any) => children
}))

import { LeaderboardPage } from "~popup/pages/LeaderboardPage"

describe("LeaderboardPage", () => {
  const mockRefreshLeaderboard = vi.fn()
  const mockSetPeriod = vi.fn()
  const mockSetScope = vi.fn()

  function setupMocks(overrides: Record<string, unknown> = {}) {
    mockUseLeaderboard.mockReturnValue({
      leaderboard: null,
      loading: false,
      period: "weekly",
      scope: "global",
      setPeriod: mockSetPeriod,
      setScope: mockSetScope,
      refreshLeaderboard: mockRefreshLeaderboard,
      ...overrides
    })
    mockUseAuth.mockReturnValue({
      user: { id: "user-123" }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it("renders scope toggle buttons (Global, Friends)", () => {
    render(<LeaderboardPage />)

    expect(screen.getByText("Global")).toBeInTheDocument()
    expect(screen.getByText("Friends")).toBeInTheDocument()
  })

  it("renders period filter buttons (Daily, Weekly, Monthly, All)", () => {
    render(<LeaderboardPage />)

    expect(screen.getByText("Daily")).toBeInTheDocument()
    expect(screen.getByText("Weekly")).toBeInTheDocument()
    expect(screen.getByText("Monthly")).toBeInTheDocument()
    expect(screen.getByText("All")).toBeInTheDocument()
  })

  it('shows "No entries yet" when leaderboard is empty', () => {
    setupMocks({ leaderboard: { entries: [] } })
    render(<LeaderboardPage />)

    expect(screen.getByText("No entries yet")).toBeInTheDocument()
  })

  it("renders entries with rank and score", () => {
    setupMocks({
      leaderboard: {
        entries: [
          {
            userId: "user-1",
            displayName: "Alice",
            githubUsername: "alice",
            avatarUrl: "https://avatar.test/alice",
            score: 892,
            rank: 1
          },
          {
            userId: "user-2",
            displayName: "Bob",
            githubUsername: "bob",
            avatarUrl: null,
            score: 756,
            rank: 4
          }
        ]
      }
    })
    render(<LeaderboardPage />)

    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("892 pts")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.getByText("756 pts")).toBeInTheDocument()
    expect(screen.getByText("4.")).toBeInTheDocument()
  })

  it("shows medals for top 3", () => {
    setupMocks({
      leaderboard: {
        entries: [
          { userId: "u1", displayName: "Alice", githubUsername: "alice", avatarUrl: null, score: 900, rank: 1 },
          { userId: "u2", displayName: "Bob", githubUsername: "bob", avatarUrl: null, score: 800, rank: 2 },
          { userId: "u3", displayName: "Charlie", githubUsername: "charlie", avatarUrl: null, score: 700, rank: 3 },
          { userId: "u4", displayName: "Dave", githubUsername: "dave", avatarUrl: null, score: 600, rank: 4 }
        ]
      }
    })
    render(<LeaderboardPage />)

    // Medals for ranks 1-3
    const medals = ["🥇", "🥈", "🥉"]
    for (const medal of medals) {
      expect(screen.getByText(medal)).toBeInTheDocument()
    }

    // Rank 4 should show as "4." not a medal
    expect(screen.getByText("4.")).toBeInTheDocument()
  })

  it("calls setScope when scope buttons are clicked", async () => {
    const user = userEvent.setup()
    render(<LeaderboardPage />)

    await user.click(screen.getByText("Friends"))
    expect(mockSetScope).toHaveBeenCalledWith("friends")

    await user.click(screen.getByText("Global"))
    expect(mockSetScope).toHaveBeenCalledWith("global")
  })

  it("calls setPeriod when period buttons are clicked", async () => {
    const user = userEvent.setup()
    render(<LeaderboardPage />)

    await user.click(screen.getByText("Daily"))
    expect(mockSetPeriod).toHaveBeenCalledWith("daily")

    await user.click(screen.getByText("Monthly"))
    expect(mockSetPeriod).toHaveBeenCalledWith("monthly")
  })

  it('highlights current user entry with "(you)" label', () => {
    setupMocks({
      leaderboard: {
        entries: [
          { userId: "user-1", displayName: "Alice", githubUsername: "alice", avatarUrl: null, score: 900, rank: 1 },
          { userId: "user-123", displayName: "Test User", githubUsername: "testuser", avatarUrl: null, score: 500, rank: 2 }
        ]
      }
    })
    render(<LeaderboardPage />)

    expect(screen.getByText("(you)")).toBeInTheDocument()
  })
})
