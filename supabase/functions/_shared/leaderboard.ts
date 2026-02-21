import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const PERIODS = ["daily", "weekly", "monthly", "all_time"] as const

/**
 * Recalculates leaderboard rankings for all periods and upserts into
 * leaderboard_cache. Returns a map of user_id -> rank for the all_time period.
 */
export async function calculateLeaderboard(
  serviceClient: SupabaseClient
): Promise<Map<string, number>> {
  const now = new Date()
  const todayStr = now.toISOString().split("T")[0]

  const dayOfWeek = now.getUTCDay()
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  const mondayStr = monday.toISOString().split("T")[0]
  const monthStart = `${todayStr.substring(0, 7)}-01`

  const { data: allUsers } = await serviceClient
    .from("users")
    .select("id, total_commits, historical_commits")

  if (!allUsers || allUsers.length === 0) {
    return new Map()
  }

  // Fetch daily_commits from month start onward (covers daily/weekly/monthly)
  const { data: allCommits } = await serviceClient
    .from("daily_commits")
    .select("user_id, date, commit_count")
    .gte("date", monthStart)

  const allTimeRanks = new Map<string, number>()

  for (const period of PERIODS) {
    let entries: Array<{ user_id: string; score: number }>

    if (period === "all_time") {
      entries = allUsers.map((u) => ({
        user_id: u.id,
        score: (u.total_commits ?? 0) + (u.historical_commits ?? 0),
      }))
    } else {
      let dateFilter: string
      if (period === "daily") dateFilter = todayStr
      else if (period === "weekly") dateFilter = mondayStr
      else dateFilter = monthStart

      const userScores = new Map<string, number>()
      for (const row of allCommits ?? []) {
        if (row.date >= dateFilter) {
          userScores.set(
            row.user_id,
            (userScores.get(row.user_id) ?? 0) + row.commit_count
          )
        }
      }

      entries = allUsers.map((u) => ({
        user_id: u.id,
        score: userScores.get(u.id) ?? 0,
      }))
    }

    // Sort descending by score
    entries.sort((a, b) => b.score - a.score)

    // Assign ranks with RANK() semantics (ties = same rank, next skips)
    const rows: Array<{
      user_id: string
      period: string
      score: number
      rank: number
      updated_at: string
    }> = []

    let currentRank = 1
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].score < entries[i - 1].score) {
        currentRank = i + 1
      }
      rows.push({
        user_id: entries[i].user_id,
        period,
        score: entries[i].score,
        rank: currentRank,
        updated_at: now.toISOString(),
      })

      if (period === "all_time") {
        allTimeRanks.set(entries[i].user_id, currentRank)
      }
    }

    // Batch upsert into leaderboard_cache
    const BATCH_SIZE = 100
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error } = await serviceClient
        .from("leaderboard_cache")
        .upsert(batch, { onConflict: "user_id,period" })

      if (error) throw error
    }
  }

  return allTimeRanks
}
