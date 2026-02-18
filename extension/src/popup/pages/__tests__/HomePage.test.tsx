import { render, screen } from "@testing-library/react"

const { mockUseStats } = vi.hoisted(() => ({
  mockUseStats: vi.fn()
}))

vi.mock("~contexts/StatsContext", () => ({
  useStats: mockUseStats,
  StatsProvider: ({ children }: any) => children
}))

import { HomePage } from "~popup/pages/HomePage"

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading when stats are loading", () => {
    mockUseStats.mockReturnValue({ stats: null, loading: true })
    render(<HomePage />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("shows loading when stats is null and loading is true", () => {
    mockUseStats.mockReturnValue({ stats: null, loading: true })
    render(<HomePage />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("displays streak count", () => {
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
      loading: false
    })
    render(<HomePage />)

    expect(screen.getByText("7-day streak")).toBeInTheDocument()
  })

  it("displays today's commits / daily goal", () => {
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
      loading: false
    })
    render(<HomePage />)

    expect(screen.getByText("3/5")).toBeInTheDocument()
    expect(screen.getByText("Today's Commits")).toBeInTheDocument()
  })

  it("displays total score and rank", () => {
    mockUseStats.mockReturnValue({
      stats: {
        todayCommits: 3,
        dailyGoal: 5,
        goalMet: false,
        currentStreak: 7,
        longestStreak: 14,
        totalScore: 1500,
        weeklyCommits: [],
        rank: 42,
        lastFetched: Date.now()
      },
      loading: false
    })
    render(<HomePage />)

    expect(screen.getByText("1,500")).toBeInTheDocument()
    expect(screen.getByText("Total Score")).toBeInTheDocument()
    expect(screen.getByText("#42")).toBeInTheDocument()
    expect(screen.getByText("Global Rank")).toBeInTheDocument()
  })

  it('shows "--" when rank is null', () => {
    mockUseStats.mockReturnValue({
      stats: {
        todayCommits: 0,
        dailyGoal: 5,
        goalMet: false,
        currentStreak: 0,
        longestStreak: 0,
        totalScore: 0,
        weeklyCommits: [],
        rank: null,
        lastFetched: Date.now()
      },
      loading: false
    })
    render(<HomePage />)

    expect(screen.getByText("--")).toBeInTheDocument()
  })
})
