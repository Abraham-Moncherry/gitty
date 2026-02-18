import { render, type RenderOptions } from "@testing-library/react"
import type { ReactElement } from "react"
import { AuthProvider } from "~contexts/SupabaseAuthContext"
import { StatsProvider } from "~contexts/StatsContext"
import { LeaderboardProvider } from "~contexts/LeaderboardContext"

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <StatsProvider>
        <LeaderboardProvider>{children}</LeaderboardProvider>
      </StatsProvider>
    </AuthProvider>
  )
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export { render } from "@testing-library/react"
export { default as userEvent } from "@testing-library/user-event"
