import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn()
}))

vi.mock("~contexts/SupabaseAuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: any) => children
}))

import { LoginPage } from "~popup/pages/LoginPage"

describe("LoginPage", () => {
  const mockSignInWithGitHub = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      signInWithGitHub: mockSignInWithGitHub
    })
  })

  it('renders "Gitty" heading and tagline', () => {
    render(<LoginPage />)

    expect(screen.getByText("Gitty")).toBeInTheDocument()
    expect(screen.getByText("Gamify your git commits")).toBeInTheDocument()
  })

  it('renders "Sign in with GitHub" button', () => {
    render(<LoginPage />)

    const button = screen.getByRole("button", { name: /sign in with github/i })
    expect(button).toBeInTheDocument()
  })

  it("calls signInWithGitHub on click", async () => {
    mockSignInWithGitHub.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole("button", { name: /sign in with github/i }))

    expect(mockSignInWithGitHub).toHaveBeenCalledTimes(1)
  })

  it('shows "Signing in..." while in progress', async () => {
    let resolveSignIn: () => void
    mockSignInWithGitHub.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSignIn = resolve })
    )

    const user = userEvent.setup()
    render(<LoginPage />)

    expect(screen.getByText("Sign in with GitHub")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /sign in with github/i }))

    expect(screen.getByText("Signing in...")).toBeInTheDocument()
    expect(screen.getByRole("button")).toBeDisabled()

    resolveSignIn!()
    await vi.waitFor(() => {
      expect(screen.getByText("Sign in with GitHub")).toBeInTheDocument()
    })
  })
})
