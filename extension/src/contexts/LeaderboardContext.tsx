import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode
} from "react"
import { supabase } from "~lib/supabase"
import { useAuth } from "~contexts/SupabaseAuthContext"
import {
  getCachedLeaderboard,
  setCachedLeaderboard,
  type CachedLeaderboard
} from "~lib/storage"

export type Period = "daily" | "weekly" | "monthly" | "all_time"
export type Scope = "global" | "friends"

interface LeaderboardContextValue {
  leaderboard: CachedLeaderboard | null
  loading: boolean
  period: Period
  scope: Scope
  setPeriod: (p: Period) => void
  setScope: (s: Scope) => void
  refreshLeaderboard: () => Promise<void>
}

const LeaderboardContext = createContext<LeaderboardContextValue | null>(null)

export function LeaderboardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [leaderboard, setLeaderboard] = useState<CachedLeaderboard | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<Period>("weekly")
  const [scope, setScope] = useState<Scope>("global")

  const refreshLeaderboard = useCallback(async () => {
    if (!user) return
    setLoading(true)

    let userIds: string[] | null = null

    // For friends scope, get friend IDs first
    if (scope === "friends") {
      const { data: friendships } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq("status", "accepted")

      userIds = (friendships ?? []).map((f) =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id
      )
      userIds.push(user.id)
    }

    let query = supabase
      .from("leaderboard_cache")
      .select(
        `
        user_id,
        score,
        rank,
        users!inner (
          display_name,
          github_username,
          avatar_url
        )
      `
      )
      .eq("period", period)
      .order("rank", { ascending: true })
      .limit(50)

    if (userIds) {
      query = query.in("user_id", userIds)
    }

    const { data } = await query

    const entries = (data ?? []).map((row: any) => ({
      userId: row.user_id,
      displayName: row.users?.display_name ?? null,
      githubUsername: row.users?.github_username ?? "",
      avatarUrl: row.users?.avatar_url ?? null,
      score: row.score,
      rank: row.rank
    }))

    const cached: CachedLeaderboard = {
      period,
      scope,
      entries,
      lastFetched: Date.now()
    }

    setLeaderboard(cached)
    await setCachedLeaderboard(cached)
    setLoading(false)
  }, [user, period, scope])

  return (
    <LeaderboardContext.Provider
      value={{
        leaderboard,
        loading,
        period,
        scope,
        setPeriod,
        setScope,
        refreshLeaderboard
      }}>
      {children}
    </LeaderboardContext.Provider>
  )
}

export function useLeaderboard() {
  const context = useContext(LeaderboardContext)
  if (!context)
    throw new Error("useLeaderboard must be used within LeaderboardProvider")
  return context
}
