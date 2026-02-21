import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createServiceClient } from "../_shared/supabase.ts"
import { authenticateAndGetGitHub, AuthError } from "../_shared/auth.ts"
import {
  fetchUserEvents,
  GitHubError,
  type GitHubEvent,
} from "../_shared/github.ts"
import { calculateStreaks, getTodayInTimezone } from "../_shared/streak.ts"
import { jsonResponse, errorResponse } from "../_shared/response.ts"
import { calculateLeaderboard } from "../_shared/leaderboard.ts"

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 1. Authenticate and get GitHub token
    const auth = await authenticateAndGetGitHub(
      req.headers.get("Authorization")
    )

    // 2. Get "today" in user's timezone
    const todayStr = getTodayInTimezone(auth.timezone)

    // 3. Fetch GitHub events
    const events = await fetchUserEvents(auth.githubUsername, auth.githubToken)

    // 4. Filter PushEvents, deduplicate by SHA, count today's commits
    const seenShas = new Set<string>()
    const repos = new Set<string>()
    let todayCommitCount = 0

    for (const event of events) {
      if (event.type !== "PushEvent") continue

      const eventDate = new Date(event.created_at).toLocaleDateString("en-CA", {
        timeZone: auth.timezone,
      })
      if (eventDate !== todayStr) continue

      repos.add(event.repo.name)

      for (const commit of event.payload.commits ?? []) {
        if (!seenShas.has(commit.sha)) {
          seenShas.add(commit.sha)
          todayCommitCount++
        }
      }
    }

    // 5. Upsert into daily_commits (service_role bypasses RLS)
    const serviceClient = createServiceClient()

    const { error: upsertError } = await serviceClient
      .from("daily_commits")
      .upsert(
        {
          user_id: auth.userId,
          date: todayStr,
          commit_count: todayCommitCount,
          repos: Array.from(repos),
          synced_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" }
      )

    if (upsertError) throw upsertError

    // 6. Get all daily_commits for streak + total calculation
    const { data: allDays } = await serviceClient
      .from("daily_commits")
      .select("date, commit_count")
      .eq("user_id", auth.userId)
      .order("date", { ascending: false })

    const { currentStreak, longestStreak } = calculateStreaks(
      allDays ?? [],
      todayStr
    )

    // 7. Sum current year commits
    const yearStart = `${todayStr.substring(0, 4)}-01-01`
    const totalCommits = (allDays ?? [])
      .filter((d) => d.date >= yearStart)
      .reduce((sum, d) => sum + d.commit_count, 0)

    // 8. Update user stats
    const { data: currentUser } = await serviceClient
      .from("users")
      .select("longest_streak, daily_goal, historical_commits")
      .eq("id", auth.userId)
      .single()

    const newLongestStreak = Math.max(
      longestStreak,
      currentUser?.longest_streak ?? 0
    )

    await serviceClient
      .from("users")
      .update({
        total_commits: totalCommits,
        current_streak: currentStreak,
        longest_streak: newLongestStreak,
      })
      .eq("id", auth.userId)

    // 9. Get weekly commits (Monday through today)
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: auth.timezone })
    )
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const mondayStr = monday.toISOString().split("T")[0]

    const weeklyCommits = (allDays ?? [])
      .filter((d) => d.date >= mondayStr && d.date <= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date, count: d.commit_count }))

    // 10. Recalculate leaderboard rankings (populates leaderboard_cache)
    const allTimeRanks = await calculateLeaderboard(serviceClient)
    const rank = allTimeRanks.get(auth.userId) ?? null

    // 11. Return stats matching CachedStats interface
    const dailyGoal = currentUser?.daily_goal ?? 5

    return jsonResponse({
      todayCommits: todayCommitCount,
      dailyGoal,
      goalMet: todayCommitCount >= dailyGoal,
      currentStreak,
      longestStreak: newLongestStreak,
      totalScore: totalCommits + (currentUser?.historical_commits ?? 0),
      weeklyCommits,
      rank,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.status)
    }
    if (err instanceof GitHubError) {
      return errorResponse(err.message, err.status)
    }
    console.error("sync-commits error:", err)
    return errorResponse("Internal server error", 500)
  }
}

serve(handler)
