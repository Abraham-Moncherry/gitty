import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TabBar, type TabId } from "~popup/components/TabBar"

describe("TabBar", () => {
  const defaultProps = {
    activeTab: "home" as TabId,
    onTabChange: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders 4 tab buttons with labels Home, Board, Badge, Me", () => {
    render(<TabBar {...defaultProps} />)

    expect(screen.getByText("Home")).toBeInTheDocument()
    expect(screen.getByText("Board")).toBeInTheDocument()
    expect(screen.getByText("Badge")).toBeInTheDocument()
    expect(screen.getByText("Me")).toBeInTheDocument()

    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(4)
  })

  it("calls onTabChange with correct TabId when clicked", async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<TabBar activeTab="home" onTabChange={onTabChange} />)

    await user.click(screen.getByText("Board"))
    expect(onTabChange).toHaveBeenCalledWith("board")

    await user.click(screen.getByText("Badge"))
    expect(onTabChange).toHaveBeenCalledWith("badge")

    await user.click(screen.getByText("Me"))
    expect(onTabChange).toHaveBeenCalledWith("me")

    await user.click(screen.getByText("Home"))
    expect(onTabChange).toHaveBeenCalledWith("home")
  })

  it("highlights active tab with text-primary class", () => {
    const { rerender } = render(<TabBar activeTab="home" onTabChange={vi.fn()} />)

    const homeButton = screen.getByText("Home").closest("button")!
    expect(homeButton.className).toContain("text-primary")

    const boardButton = screen.getByText("Board").closest("button")!
    expect(boardButton.className).not.toContain("text-primary")
    expect(boardButton.className).toContain("text-slate-light")

    rerender(<TabBar activeTab="board" onTabChange={vi.fn()} />)

    const homeAfter = screen.getByText("Home").closest("button")!
    expect(homeAfter.className).not.toContain("text-primary")

    const boardAfter = screen.getByText("Board").closest("button")!
    expect(boardAfter.className).toContain("text-primary")
  })
})
