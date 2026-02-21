import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { calculateStreaks, getTodayInTimezone } from "./streak.ts"

Deno.test("calculateStreaks", async (t) => {
  await t.step("returns 0/0 for empty days array", () => {
    const result = calculateStreaks([], "2026-02-21")
    assertEquals(result, { currentStreak: 0, longestStreak: 0 })
  })

  await t.step("returns 0/0 when all days have 0 commits", () => {
    const days = [
      { date: "2026-02-20", commit_count: 0 },
      { date: "2026-02-19", commit_count: 0 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result, { currentStreak: 0, longestStreak: 0 })
  })

  await t.step("counts current streak from today", () => {
    const days = [
      { date: "2026-02-21", commit_count: 3 },
      { date: "2026-02-20", commit_count: 2 },
      { date: "2026-02-19", commit_count: 1 },
      { date: "2026-02-18", commit_count: 0 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result.currentStreak, 3)
  })

  await t.step("starts from yesterday if today has 0 commits", () => {
    const days = [
      { date: "2026-02-21", commit_count: 0 },
      { date: "2026-02-20", commit_count: 5 },
      { date: "2026-02-19", commit_count: 2 },
      { date: "2026-02-18", commit_count: 0 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result.currentStreak, 2)
  })

  await t.step("streak of 1 when only today has commits", () => {
    const days = [
      { date: "2026-02-21", commit_count: 1 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result.currentStreak, 1)
    assertEquals(result.longestStreak, 1)
  })

  await t.step("calculates longest streak in the past", () => {
    const days = [
      { date: "2026-02-21", commit_count: 1 }, // current: 1
      { date: "2026-02-20", commit_count: 0 }, // gap
      { date: "2026-02-15", commit_count: 2 }, // past streak: 5
      { date: "2026-02-14", commit_count: 3 },
      { date: "2026-02-13", commit_count: 1 },
      { date: "2026-02-12", commit_count: 4 },
      { date: "2026-02-11", commit_count: 2 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result.currentStreak, 1)
    assertEquals(result.longestStreak, 5)
  })

  await t.step("longest streak equals current when current is longest", () => {
    const days = [
      { date: "2026-02-21", commit_count: 1 },
      { date: "2026-02-20", commit_count: 1 },
      { date: "2026-02-19", commit_count: 1 },
      { date: "2026-02-18", commit_count: 1 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result.currentStreak, 4)
    assertEquals(result.longestStreak, 4)
  })

  await t.step("handles gap between days correctly", () => {
    // Days with commits on Feb 21 and Feb 19 (gap on 20th)
    const days = [
      { date: "2026-02-21", commit_count: 1 },
      { date: "2026-02-19", commit_count: 1 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result.currentStreak, 1) // only today, gap breaks it
    assertEquals(result.longestStreak, 1)
  })

  await t.step("handles RANK-style ties in commit_count", () => {
    // All days have commits, streak should count regardless of commit_count
    const days = [
      { date: "2026-02-21", commit_count: 100 },
      { date: "2026-02-20", commit_count: 1 },
      { date: "2026-02-19", commit_count: 50 },
    ]
    const result = calculateStreaks(days, "2026-02-21")
    assertEquals(result.currentStreak, 3)
    assertEquals(result.longestStreak, 3)
  })
})

Deno.test("getTodayInTimezone", async (t) => {
  await t.step("returns a YYYY-MM-DD string", () => {
    const result = getTodayInTimezone("UTC")
    assertEquals(result.length, 10)
    assertEquals(result[4], "-")
    assertEquals(result[7], "-")
  })

  await t.step("returns valid date parts", () => {
    const result = getTodayInTimezone("UTC")
    const [year, month, day] = result.split("-").map(Number)
    assertEquals(year >= 2026, true)
    assertEquals(month >= 1 && month <= 12, true)
    assertEquals(day >= 1 && day <= 31, true)
  })
})
