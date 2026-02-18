import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockUseAuth, mockSupabase, chainable } = vi.hoisted(() => {
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

vi.mock("~lib/supabase", () => ({ supabase: mockSupabase }))

import { SettingsPage } from "~popup/pages/SettingsPage"

describe("SettingsPage", () => {
  const mockSignOut = vi.fn()

  function createUser(overrides: Record<string, unknown> = {}) {
    return {
      id: "user-123",
      github_username: "testuser",
      avatar_url: "https://avatars.githubusercontent.com/u/1",
      display_name: "Test User",
      daily_goal: 5,
      notifications_enabled: true,
      notification_time: "20:00:00",
      timezone: "America/New_York",
      total_commits: 42,
      historical_commits: 100,
      current_streak: 7,
      longest_streak: 14,
      friend_code: "ABCD-1234",
      backfill_completed: true,
      backfill_started_at: null,
      created_at: "2026-01-15T00:00:00Z",
      updated_at: "2026-02-16T00:00:00Z",
      ...overrides
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: createUser(),
      signOut: mockSignOut
    })
  })

  it("returns null when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null, signOut: mockSignOut })

    const { container } = render(<SettingsPage />)
    expect(container.innerHTML).toBe("")
  })

  it("displays github username and join date", () => {
    render(<SettingsPage />)

    expect(screen.getByText("@testuser")).toBeInTheDocument()
    expect(screen.getByText(/Joined Jan 2026/)).toBeInTheDocument()
  })

  it("renders daily goal input", () => {
    render(<SettingsPage />)

    expect(screen.getByText("Daily Goal")).toBeInTheDocument()
    const input = screen.getByRole("spinbutton")
    expect(input).toHaveValue(5)
    expect(screen.getByText("commits/day")).toBeInTheDocument()
  })

  it("renders sign out button that calls signOut", async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    const signOutButton = screen.getByRole("button", { name: /sign out/i })
    expect(signOutButton).toBeInTheDocument()

    await user.click(signOutButton)
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it("displays friend code", () => {
    render(<SettingsPage />)

    expect(screen.getByText("Friend Code")).toBeInTheDocument()
    expect(screen.getByText("ABCD-1234")).toBeInTheDocument()
  })

  it('displays "N/A" when friend code is null', () => {
    mockUseAuth.mockReturnValue({
      user: createUser({ friend_code: null }),
      signOut: mockSignOut
    })
    render(<SettingsPage />)

    expect(screen.getByText("N/A")).toBeInTheDocument()
  })
})
