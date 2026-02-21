import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createServiceClient } from "../_shared/supabase.ts"
import { authenticateAndGetGitHub, AuthError } from "../_shared/auth.ts"
import {
  fetchContributionsGraphQL,
  GitHubError,
} from "../_shared/github.ts"
import { calculateStreaks, getTodayInTimezone } from "../_shared/streak.ts"
import { jsonResponse, errorResponse } from "../_shared/response.ts"
import { calculateLeaderboard } from "../_shared/leaderboard.ts"

const CONTRIBUTIONS_QUERY = `
  query($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`

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
    const currentYear = todayStr.substring(0, 4)

    // 3. Fetch contributions via GraphQL (reliable, unlike Events API)
    const fromDate = `${currentYear}-01-01T00:00:00Z`
    const toDate = `${currentYear}-12-31T23:59:59Z`

    const gqlData = (await fetchContributionsGraphQL(
      auth.githubUsername,
      auth.githubToken,
      CONTRIBUTIONS_QUERY,
      { username: auth.githubUsername, from: fromDate, to: toDate }
    )) as {
      user: {
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: number
            weeks: Array<{
              contributionDays: Array<{
                date: string
                contributionCount: number
              }>
            }>
          }
        }
      }
    }

    const calendar =
      gqlData.user.contributionsCollection.contributionCalendar

    // 4. Extract today's count and build daily data from GraphQL
    let todayCommitCount = 0
    const dailyData: Array<{ date: string; commit_count: number }> = []

    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        if (day.contributionCount > 0) {
          dailyData.push({
            date: day.date,
            commit_count: day.contributionCount,
          })
        }
        if (day.date === todayStr) {
          todayCommitCount = day.contributionCount
        }
      }
    }

    // 5. Upsert today into daily_commits (service_role bypasses RLS)
    // Use the max of GraphQL count and existing DB count so we never
    // overwrite with a lower value
    const serviceClient = createServiceClient()

    const { data: existingRow } = await serviceClient
      .from("daily_commits")
      .select("commit_count")
      .eq("user_id", auth.userId)
      .eq("date", todayStr)
      .single()

    const finalCount = Math.max(todayCommitCount, existingRow?.commit_count ?? 0)

    const { error: upsertError } = await serviceClient
      .from("daily_commits")
      .upsert(
        {
          user_id: auth.userId,
          date: todayStr,
          commit_count: finalCount,
          repos: [],
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
    const yearStart = `${currentYear}-01-01`
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
      todayCommits: finalCount,
      dailyGoal,
      goalMet: finalCount >= dailyGoal,
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
