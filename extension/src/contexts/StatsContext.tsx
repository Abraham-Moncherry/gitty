import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode
} from "react"
import { supabase } from "~lib/supabase"
import {
  getCachedStats,
  setCachedStats,
  type CachedStats
} from "~lib/storage"
import { useAuth } from "~contexts/SupabaseAuthContext"

interface StatsContextValue {
  stats: CachedStats | null
  loading: boolean
  refreshStats: () => Promise<void>
}

const StatsContext = createContext<StatsContextValue | null>(null)

export function StatsProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth()
  const [stats, setStats] = useState<CachedStats | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshStats = useCallback(async () => {
    if (!user || !session) return

    const today = new Date().toISOString().split("T")[0]

    // Fetch today's commits
    const { data: todayData } = await supabase
      .from("daily_commits")
      .select("commit_count, goal_met")
      .eq("user_id", user.id)
      .eq("date", today)
      .single()

    // Fetch this week's commits (Monday to Sunday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const mondayStr = monday.toISOString().split("T")[0]

    const { data: weekData } = await supabase
      .from("daily_commits")
      .select("date, commit_count")
      .eq("user_id", user.id)
      .gte("date", mondayStr)
      .order("date", { ascending: true })

    // Fetch user's rank
    const { data: rankData } = await supabase
      .from("leaderboard_cache")
      .select("rank")
      .eq("user_id", user.id)
      .eq("period", "all_time")
      .single()

    const newStats: CachedStats = {
      todayCommits: todayData?.commit_count ?? 0,
      dailyGoal: user.daily_goal,
      goalMet: todayData?.goal_met ?? false,
      currentStreak: user.current_streak,
      longestStreak: user.longest_streak,
      totalScore: user.total_commits + user.historical_commits,
      weeklyCommits:
        weekData?.map((d) => ({ date: d.date, count: d.commit_count })) ?? [],
      rank: rankData?.rank ?? null,
      lastFetched: Date.now()
    }

    setStats(newStats)
    await setCachedStats(newStats)
    setLoading(false)
  }, [user, session])

  useEffect(() => {
    if (!user) {
      setStats(null)
      setLoading(false)
      return
    }

    ;(async () => {
      // Load cached first for fast paint
      const cached = await getCachedStats()
      if (cached) {
        setStats(cached)
        setLoading(false)
      }
      // Then fetch fresh data
      await refreshStats()
    })()
  }, [user, refreshStats])

  return (
    <StatsContext.Provider value={{ stats, loading, refreshStats }}>
      {children}
    </StatsContext.Provider>
  )
}

export function useStats() {
  const context = useContext(StatsContext)
  if (!context) throw new Error("useStats must be used within StatsProvider")
  return context
}
