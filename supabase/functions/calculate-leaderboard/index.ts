import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createServiceClient } from "../_shared/supabase.ts"
import { jsonResponse, errorResponse } from "../_shared/response.ts"

const PERIODS = ["daily", "weekly", "monthly", "all_time"] as const

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Verify authorization (pg_cron sends service_role key)
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return errorResponse("Unauthorized", 401)
    }

    const serviceClient = createServiceClient()

    // Date boundaries (UTC for global consistency)
    const now = new Date()
    const todayStr = now.toISOString().split("T")[0]

    const dayOfWeek = now.getUTCDay()
    const monday = new Date(now)
    monday.setUTCDate(
      now.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
    )
    const mondayStr = monday.toISOString().split("T")[0]
    const monthStart = `${todayStr.substring(0, 7)}-01`

    // Get all users (everyone gets a rank entry, even with 0 commits)
    const { data: allUsers } = await serviceClient
      .from("users")
      .select("id, total_commits, historical_commits")

    if (!allUsers || allUsers.length === 0) {
      return jsonResponse({ success: true, periods: 4, users: 0 })
    }

    for (const period of PERIODS) {
      let entries: Array<{ user_id: string; score: number }>

      if (period === "all_time") {
        // All-time: total_commits + historical_commits from users table
        entries = allUsers.map((u) => ({
          user_id: u.id,
          score: (u.total_commits ?? 0) + (u.historical_commits ?? 0),
        }))
      } else {
        // Time-bounded: aggregate from daily_commits
        let dateFilter: string
        if (period === "daily") dateFilter = todayStr
        else if (period === "weekly") dateFilter = mondayStr
        else dateFilter = monthStart

        const { data: commits } = await serviceClient
          .from("daily_commits")
          .select("user_id, commit_count")
          .gte("date", dateFilter)

        // Aggregate by user_id
        const userScores = new Map<string, number>()
        for (const row of commits ?? []) {
          const current = userScores.get(row.user_id) ?? 0
          userScores.set(row.user_id, current + row.commit_count)
        }

        // Start with all users at 0, then overlay actual scores
        entries = allUsers.map((u) => ({
          user_id: u.id,
          score: userScores.get(u.id) ?? 0,
        }))
      }

      // Sort by score descending for rank assignment
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

    return jsonResponse({
      success: true,
      periods: PERIODS.length,
      users: allUsers.length,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error("calculate-leaderboard error:", err)
    return errorResponse("Internal server error", 500)
  }
})
