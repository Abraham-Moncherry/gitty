import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { createServiceClient } from "../_shared/supabase.ts"
import { jsonResponse, errorResponse } from "../_shared/response.ts"

export async function handler(req: Request): Promise<Response> {
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

    // Get all users with notifications enabled
    const { data: users, error: usersError } = await serviceClient
      .from("users")
      .select("id, daily_goal, current_streak, timezone, notification_time")
      .eq("notifications_enabled", true)

    if (usersError) throw usersError
    if (!users || users.length === 0) {
      return jsonResponse({ success: true, notificationsQueued: 0 })
    }

    let queued = 0

    for (const user of users) {
      const tz = user.timezone ?? "UTC"
      const now = new Date()

      // Get current time in user's timezone
      const userTimeStr = now.toLocaleTimeString("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })

      // Parse notification_time (stored as HH:MM:SS)
      const notifTime = (user.notification_time as string).substring(0, 5)

      // Check if current time is within +/- 15 minutes of notification_time
      if (!isWithinWindow(userTimeStr, notifTime, 15)) continue

      // Get today's date in user's timezone
      const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz })

      // Check today's commits
      const { data: todayRow } = await serviceClient
        .from("daily_commits")
        .select("commit_count, goal_met")
        .eq("user_id", user.id)
        .eq("date", todayStr)
        .single()

      const todayCommits = todayRow?.commit_count ?? 0
      const goalMet = todayRow?.goal_met ?? false

      // Check for duplicate notifications today
      const { data: existingNotifs } = await serviceClient
        .from("notification_queue")
        .select("type")
        .eq("user_id", user.id)
        .gte("created_at", `${todayStr}T00:00:00`)

      const existingTypes = new Set(
        (existingNotifs ?? []).map((n: { type: string }) => n.type)
      )

      // Goal reminder: user hasn't met daily goal
      if (!goalMet && !existingTypes.has("goal_reminder")) {
        const { error } = await serviceClient
          .from("notification_queue")
          .insert({
            user_id: user.id,
            type: "goal_reminder",
            title: "Keep going!",
            body: `You have ${todayCommits}/${user.daily_goal} commits today.`,
          })
        if (!error) queued++
      }

      // Streak warning: user has a streak but 0 commits today
      if (
        user.current_streak > 0 &&
        todayCommits === 0 &&
        !existingTypes.has("streak_warning")
      ) {
        const { error } = await serviceClient
          .from("notification_queue")
          .insert({
            user_id: user.id,
            type: "streak_warning",
            title: "Streak at risk!",
            body: `Don't lose your ${user.current_streak}-day streak!`,
          })
        if (!error) queued++
      }
    }

    return jsonResponse({
      success: true,
      usersChecked: users.length,
      notificationsQueued: queued,
    })
  } catch (err) {
    console.error("check-notifications error:", err)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * Check if `current` time (HH:MM) is within `windowMinutes` of `target` time (HH:MM).
 */
function isWithinWindow(
  current: string,
  target: string,
  windowMinutes: number
): boolean {
  const [cH, cM] = current.split(":").map(Number)
  const [tH, tM] = target.split(":").map(Number)

  const currentMinutes = cH * 60 + cM
  const targetMinutes = tH * 60 + tM

  let diff = Math.abs(currentMinutes - targetMinutes)
  // Handle midnight wraparound (e.g., 23:50 vs 00:05)
  if (diff > 720) diff = 1440 - diff

  return diff <= windowMinutes
}

serve(handler)
