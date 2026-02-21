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

    try {
      const { data, error } = await supabase.functions.invoke("sync-commits")

      if (error || !data) {
        console.warn("[Gitty] sync-commits failed in StatsContext:", error?.message)
        setLoading(false)
        return
      }

      const newStats: CachedStats = {
        todayCommits: data.todayCommits ?? 0,
        dailyGoal: data.dailyGoal ?? 5,
        goalMet: data.goalMet ?? false,
        currentStreak: data.currentStreak ?? 0,
        longestStreak: data.longestStreak ?? 0,
        totalScore: data.totalScore ?? 0,
        weeklyCommits: data.weeklyCommits ?? [],
        rank: data.rank ?? null,
        lastFetched: Date.now()
      }

      setStats(newStats)
      await setCachedStats(newStats)
    } catch (err) {
      console.error("[Gitty] StatsContext refresh error:", err)
    } finally {
      setLoading(false)
    }
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
