export {}

import { supabase } from "~lib/supabase"
import { setCachedStats, type CachedStats } from "~lib/storage"

const ALARM_SYNC = "sync-commits"
const ALARM_GOAL = "check-daily-goal"

// ── Extension lifecycle ───────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Gitty] Extension installed")
  await setupAlarms()
  await checkAuthAndSync()
})

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Gitty] Extension started")
  await setupAlarms()
  await checkAuthAndSync()
})

// ── Alarms ────────────────────────────────────────────────────

async function setupAlarms() {
  await chrome.alarms.create(ALARM_SYNC, { periodInMinutes: 30 })
  await scheduleGoalAlarm()
}

async function scheduleGoalAlarm() {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  if (!session) return

  const { data: user } = await supabase
    .from("users")
    .select("notifications_enabled, notification_time, timezone")
    .eq("id", session.user.id)
    .single()

  if (!user || !user.notifications_enabled) {
    await chrome.alarms.clear(ALARM_GOAL)
    return
  }

  const userTz = user.timezone || "UTC"
  const [hours, minutes] = user.notification_time.split(":").map(Number)

  // Calculate next occurrence of notification_time in user's timezone
  const nowInTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: userTz })
  )
  const targetInTz = new Date(nowInTz)
  targetInTz.setHours(hours, minutes, 0, 0)

  // If the time already passed today, schedule for tomorrow
  if (targetInTz <= nowInTz) {
    targetInTz.setDate(targetInTz.getDate() + 1)
  }

  // Convert back to absolute time: offset = (nowInTz - realNow), apply inverse
  const realNow = Date.now()
  const offsetMs = nowInTz.getTime() - realNow
  const alarmTime = targetInTz.getTime() - offsetMs

  await chrome.alarms.create(ALARM_GOAL, { when: alarmTime })
  console.log(
    `[Gitty] Goal reminder scheduled for ${targetInTz.toLocaleString()} (${userTz})`
  )
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SYNC) {
    await syncCommits()
  } else if (alarm.name === ALARM_GOAL) {
    await checkDailyGoal()
    // Reschedule for tomorrow
    await scheduleGoalAlarm()
  }
})

// ── Message handler ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SIGNED_IN") {
    console.log("[Gitty] User signed in, syncing...")
    checkAuthAndSync()
  }

  if (message.type === "SETTINGS_UPDATED") {
    console.log("[Gitty] Settings updated, rescheduling goal alarm...")
    scheduleGoalAlarm()
  }

  if (message.type === "START_OAUTH") {
    console.log("[Gitty] Starting OAuth flow from background...")
    handleOAuthFlow().then((result) => {
      sendResponse(result)
    })
    // Return true to indicate async sendResponse
    return true
  }
})

// ── OAuth flow (runs in background so it survives popup close) ──

async function handleOAuthFlow(): Promise<{ success: boolean; error?: string }> {
  try {
    const redirectUrl = chrome.identity.getRedirectURL()

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        scopes: "read:user"
      }
    })

    if (error || !data.url) {
      return { success: false, error: error?.message ?? "No OAuth URL" }
    }

    console.log("[Gitty] OAuth URL:", data.url)

    const responseUrl = await new Promise<string | undefined>((resolve) => {
      chrome.identity.launchWebAuthFlow(
        { url: data.url, interactive: true },
        (callbackUrl) => {
          if (chrome.runtime.lastError) {
            console.error("[Gitty] Auth flow error:", chrome.runtime.lastError.message)
          }
          resolve(callbackUrl)
        }
      )
    })

    if (!responseUrl) {
      return { success: false, error: "Auth flow cancelled" }
    }

    const url = new URL(responseUrl)

    // Implicit flow — tokens in hash fragment
    const hashParams = new URLSearchParams(url.hash.substring(1))
    const accessToken = hashParams.get("access_token")
    const refreshToken = hashParams.get("refresh_token")
    const providerToken = hashParams.get("provider_token")

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })

      if (providerToken) {
        await supabase.auth.updateUser({
          data: { provider_token: providerToken }
        })
      }

      console.log("[Gitty] OAuth complete, running sync...")
      await checkAuthAndSync()
      return { success: true }
    }

    return { success: false, error: "No auth tokens in response" }
  } catch (err) {
    console.error("[Gitty] OAuth error:", err)
    return { success: false, error: String(err) }
  }
}

// ── Auth check ────────────────────────────────────────────────

async function checkAuthAndSync() {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  if (!session) {
    console.log("[Gitty] No session, skipping sync")
    return
  }

  const { error } = await supabase.auth.refreshSession()
  if (error) {
    console.warn("[Gitty] Failed to refresh session:", error.message)
    return
  }

  await backfillIfNeeded()
  await syncCommits()
}

// ── Backfill history (runs once after first login) ───────────

async function backfillIfNeeded() {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  if (!session) return

  try {
    const { data: user } = await supabase
      .from("users")
      .select("backfill_completed")
      .eq("id", session.user.id)
      .single()

    if (user?.backfill_completed) return

    console.log("[Gitty] Running first-time backfill...")
    const { data, error } = await supabase.functions.invoke("backfill-history")

    if (error) {
      console.warn("[Gitty] backfill-history failed:", error.message)
      return
    }

    console.log("[Gitty] Backfill complete:", data)
  } catch (err) {
    console.error("[Gitty] Backfill error:", err)
  }
}

// ── Commit sync ───────────────────────────────────────────────

async function syncCommits() {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  if (!session) return

  try {
    const { data, error } = await supabase.functions.invoke("sync-commits")

    if (error) {
      // Edge function may not be deployed yet
      console.warn("[Gitty] sync-commits failed:", error.message)
      return
    }

    if (data) {
      const stats: CachedStats = {
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
      await setCachedStats(stats)


    }
  } catch (err) {
    console.error("[Gitty] Sync error:", err)
  }
}

// ── Daily goal check ──────────────────────────────────────────

async function checkDailyGoal() {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  if (!session) return

  try {
    const { data: user } = await supabase
      .from("users")
      .select("daily_goal, notifications_enabled, timezone")
      .eq("id", session.user.id)
      .single()

    if (!user || !user.notifications_enabled) return

    const userTz = user.timezone || "UTC"
    const today = new Date().toLocaleDateString("en-CA", { timeZone: userTz })
    const { data: todayData } = await supabase
      .from("daily_commits")
      .select("commit_count, goal_met")
      .eq("user_id", session.user.id)
      .eq("date", today)
      .single()

    const commits = todayData?.commit_count ?? 0
    const goalMet = todayData?.goal_met ?? false

    if (!goalMet) {
      chrome.notifications.create(`goal-reminder-${today}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon.png"),
        title: "Gitty",
        message: `You have ${commits}/${user.daily_goal} commits today. Keep going!`,
        priority: 1
      })
    }

    // Deliver any pending notification_queue entries as Chrome notifications
    const { data: pending } = await supabase
      .from("notification_queue")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(5)

    for (const notif of pending ?? []) {
      chrome.notifications.create(`notif-${notif.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("assets/icon.png"),
        title: notif.title,
        message: notif.body,
        priority: 1
      })
    }
  } catch (err) {
    console.error("[Gitty] Goal check error:", err)
  }
}
