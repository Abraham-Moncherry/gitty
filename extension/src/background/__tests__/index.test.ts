// ---------------------------------------------------------------------------
// Hoisted mocks - must be declared before vi.mock calls
// ---------------------------------------------------------------------------
const { mockSupabase, mockSetCachedStats, chainable } = vi.hoisted(() => {
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
    mockSupabase: {
      from: vi.fn(() => chainable()),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        refreshSession: vi.fn().mockResolvedValue({ error: null })
      },
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null })
      }
    },
    mockSetCachedStats: vi.fn().mockResolvedValue(undefined),
    chainable
  }
})

vi.mock("~lib/supabase", () => ({ supabase: mockSupabase }))
vi.mock("~lib/storage", () => ({
  setCachedStats: mockSetCachedStats
}))

// Import triggers side-effect listener registration
import "~background/index"

// ---------------------------------------------------------------------------
// Capture registered callbacks immediately (before beforeEach clears mocks)
// ---------------------------------------------------------------------------

const onInstalledCallback = (
  chrome.runtime.onInstalled.addListener as ReturnType<typeof vi.fn>
).mock.calls[0][0] as (...args: any[]) => Promise<void>

const onStartupCallback = (
  chrome.runtime.onStartup.addListener as ReturnType<typeof vi.fn>
).mock.calls[0][0] as (...args: any[]) => Promise<void>

const onAlarmCallback = (
  chrome.alarms.onAlarm.addListener as ReturnType<typeof vi.fn>
).mock.calls[0][0] as (alarm: { name: string }) => Promise<void>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("background/index.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no session
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    mockSupabase.auth.refreshSession.mockResolvedValue({ error: null })
    mockSupabase.functions.invoke.mockResolvedValue({ data: null, error: null })
  })

  // ---- Listener registration ----

  it("registered onInstalled, onStartup, and onAlarm listeners on import", () => {
    // These were captured at import time above — verify they exist
    expect(onInstalledCallback).toBeTypeOf("function")
    expect(onStartupCallback).toBeTypeOf("function")
    expect(onAlarmCallback).toBeTypeOf("function")
  })

  // ---- setupAlarms (called from onInstalled/onStartup) -------------------

  it("setupAlarms creates two alarms (sync-commits at 30min, check-daily-goal at 60min)", async () => {
    await onInstalledCallback()

    expect(chrome.alarms.create).toHaveBeenCalledWith("sync-commits", { periodInMinutes: 30 })
    expect(chrome.alarms.create).toHaveBeenCalledWith("check-daily-goal", { periodInMinutes: 60 })
  })

  // ---- syncCommits (via alarm) -------------------------------------------

  describe("syncCommits (via alarm)", () => {
    it("invokes edge function, caches stats, and sets badge text", async () => {
      const session = {
        user: { id: "user-123" },
        access_token: "tok",
        refresh_token: "ref"
      }
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session }
      })
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          todayCommits: 5,
          dailyGoal: 10,
          goalMet: false,
          currentStreak: 3,
          longestStreak: 7,
          totalScore: 200,
          weeklyCommits: [{ date: "2026-02-19", count: 5 }],
          rank: 12
        },
        error: null
      })

      await onAlarmCallback({ name: "sync-commits" })

      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith("sync-commits")

      expect(mockSetCachedStats).toHaveBeenCalledWith(
        expect.objectContaining({
          todayCommits: 5,
          dailyGoal: 10,
          goalMet: false,
          currentStreak: 3,
          longestStreak: 7,
          totalScore: 200,
          rank: 12
        })
      )

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "5" })
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#3B82F6" })
    })

    it("skips when no session", async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null }
      })

      await onAlarmCallback({ name: "sync-commits" })

      expect(mockSupabase.functions.invoke).not.toHaveBeenCalled()
      expect(mockSetCachedStats).not.toHaveBeenCalled()
    })

    it("sets empty badge text when todayCommits is 0", async () => {
      const session = { user: { id: "user-123" }, access_token: "tok" }
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session } })
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          todayCommits: 0,
          dailyGoal: 5,
          goalMet: false,
          currentStreak: 0,
          longestStreak: 0,
          totalScore: 0,
          weeklyCommits: [],
          rank: null
        },
        error: null
      })

      await onAlarmCallback({ name: "sync-commits" })

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" })
    })
  })

  // ---- checkDailyGoal (via alarm) ----------------------------------------

  describe("checkDailyGoal (via alarm)", () => {
    it("skips when no session", async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null }
      })

      await onAlarmCallback({ name: "check-daily-goal" })

      expect(mockSupabase.from).not.toHaveBeenCalled()
    })
  })
})
