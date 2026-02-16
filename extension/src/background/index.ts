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
  await chrome.alarms.create(ALARM_GOAL, { periodInMinutes: 60 })
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SYNC) {
    await syncCommits()
  } else if (alarm.name === ALARM_GOAL) {
    await checkDailyGoal()
  }
})

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

  await syncCommits()
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

      // Show today's commit count on the extension icon badge
      chrome.action.setBadgeText({
        text: stats.todayCommits > 0 ? `${stats.todayCommits}` : ""
      })
      chrome.action.setBadgeBackgroundColor({ color: "#3B82F6" })
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
      .select(
        "daily_goal, notifications_enabled, notification_time, timezone, github_username"
      )
      .eq("id", session.user.id)
      .single()

    if (!user || !user.notifications_enabled) return

    // Only notify within 1 hour of the configured notification time
    const now = new Date()
    const [hours] = user.notification_time.split(":").map(Number)
    if (Math.abs(now.getHours() - hours) > 1) return

    const today = now.toISOString().split("T")[0]
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

    // Deliver any pending notification_queue entries
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

      await supabase
        .from("notification_queue")
        .update({ read: true })
        .eq("id", notif.id)
    }
  } catch (err) {
    console.error("[Gitty] Goal check error:", err)
  }
}
