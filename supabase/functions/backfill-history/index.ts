import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createServiceClient } from "../_shared/supabase.ts"
import { authenticateAndGetGitHub, AuthError } from "../_shared/auth.ts"
import { fetchContributionsGraphQL, GitHubError } from "../_shared/github.ts"
import { calculateStreaks, getTodayInTimezone } from "../_shared/streak.ts"
import { jsonResponse, errorResponse } from "../_shared/response.ts"

const CURRENT_YEAR_QUERY = `
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

const ALL_TIME_QUERY = `
  query($username: String!) {
    user(login: $username) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
        }
      }
      createdAt
    }
  }
`

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 1. Authenticate
    const auth = await authenticateAndGetGitHub(
      req.headers.get("Authorization")
    )
    const serviceClient = createServiceClient()

    // 2. Check if backfill already completed
    const { data: user } = await serviceClient
      .from("users")
      .select("backfill_completed")
      .eq("id", auth.userId)
      .single()

    if (user?.backfill_completed) {
      return jsonResponse({ skipped: true, message: "Backfill already completed" })
    }

    // 3. Mark backfill_started_at
    await serviceClient
      .from("users")
      .update({ backfill_started_at: new Date().toISOString() })
      .eq("id", auth.userId)

    // 4. GraphQL Query 1: Current year daily contributions
    const currentYear = new Date().getFullYear()
    const fromDate = `${currentYear}-01-01T00:00:00Z`
    const toDate = `${currentYear}-12-31T23:59:59Z`

    const yearData = (await fetchContributionsGraphQL(
      auth.githubUsername,
      auth.githubToken,
      CURRENT_YEAR_QUERY,
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

    // 5. GraphQL Query 2: All-time total
    const allTimeData = (await fetchContributionsGraphQL(
      auth.githubUsername,
      auth.githubToken,
      ALL_TIME_QUERY,
      { username: auth.githubUsername }
    )) as {
      user: {
        contributionsCollection: {
          contributionCalendar: { totalContributions: number }
        }
        createdAt: string
      }
    }

    const yearCalendar =
      yearData.user.contributionsCollection.contributionCalendar
    const allTimeTotal =
      allTimeData.user.contributionsCollection.contributionCalendar
        .totalContributions

    // 6. Extract daily rows from weeks → contributionDays
    const dailyRows: Array<{
      user_id: string
      date: string
      commit_count: number
      repos: string[]
    }> = []

    let currentYearSum = 0
    for (const week of yearCalendar.weeks) {
      for (const day of week.contributionDays) {
        if (day.contributionCount > 0) {
          dailyRows.push({
            user_id: auth.userId,
            date: day.date,
            commit_count: day.contributionCount,
            repos: [],
          })
          currentYearSum += day.contributionCount
        }
      }
    }

    // 7. Batch upsert into daily_commits (chunks of 100)
    const BATCH_SIZE = 100
    for (let i = 0; i < dailyRows.length; i += BATCH_SIZE) {
      const batch = dailyRows.slice(i, i + BATCH_SIZE)
      const { error } = await serviceClient
        .from("daily_commits")
        .upsert(batch, { onConflict: "user_id,date" })

      if (error) throw error
    }

    // 8. Calculate streaks from full dataset
    const todayStr = getTodayInTimezone(auth.timezone)
    const { currentStreak, longestStreak } = calculateStreaks(
      dailyRows.map((r) => ({ date: r.date, commit_count: r.commit_count })),
      todayStr
    )

    // 9. Calculate historical_commits
    const historicalCommits = Math.max(0, allTimeTotal - currentYearSum)

    // 10. Update user stats and mark backfill complete
    const { error: updateError } = await serviceClient
      .from("users")
      .update({
        total_commits: currentYearSum,
        historical_commits: historicalCommits,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        backfill_completed: true,
      })
      .eq("id", auth.userId)

    if (updateError) throw updateError

    return jsonResponse({
      backfilled: true,
      currentYearCommits: currentYearSum,
      historicalCommits,
      totalContributions: allTimeTotal,
      currentStreak,
      longestStreak,
      daysProcessed: dailyRows.length,
    })
  } catch (err) {
    // On failure, backfill_completed stays false so user can retry
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.status)
    }
    if (err instanceof GitHubError) {
      return errorResponse(err.message, err.status)
    }
    console.error("backfill-history error:", err)
    return errorResponse("Internal server error", 500)
  }
})
