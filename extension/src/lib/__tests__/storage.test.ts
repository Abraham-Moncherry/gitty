import { describe, it, expect, beforeEach } from "vitest"
import { resetChromeStorage } from "~/__tests__/setup"
import {
  getCachedStats,
  setCachedStats,
  getCachedLeaderboard,
  setCachedLeaderboard,
  clearAllCache,
  type CachedStats,
  type CachedLeaderboard
} from "~lib/storage"

const mockStats: CachedStats = {
  todayCommits: 3,
  dailyGoal: 5,
  goalMet: false,
  currentStreak: 7,
  longestStreak: 14,
  totalScore: 142,
  weeklyCommits: [{ date: "2026-02-16", count: 5 }],
  rank: 42,
  lastFetched: 1000
}

const mockLeaderboard: CachedLeaderboard = {
  period: "weekly",
  scope: "global",
  entries: [
    {
      userId: "user-1",
      displayName: "Alice",
      githubUsername: "alice",
      avatarUrl: null,
      score: 100,
      rank: 1
    }
  ],
  lastFetched: 2000
}

describe("storage", () => {
  beforeEach(() => {
    resetChromeStorage()
  })

  describe("getCachedStats", () => {
    it("should return null when no stats are cached", async () => {
      const result = await getCachedStats()
      expect(result).toBeNull()
    })

    it("should return cached stats when they exist", async () => {
      await setCachedStats(mockStats)
      const result = await getCachedStats()
      expect(result).toEqual(mockStats)
    })

    it("should call chrome.storage.local.get with correct key", async () => {
      await getCachedStats()
      expect(chrome.storage.local.get).toHaveBeenCalledWith("gitty:stats")
    })
  })

  describe("setCachedStats", () => {
    it("should write stats to chrome.storage.local with correct key", async () => {
      await setCachedStats(mockStats)
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        "gitty:stats": mockStats
      })
    })

    it("should store the exact CachedStats object passed in", async () => {
      await setCachedStats(mockStats)
      const result = await getCachedStats()
      expect(result).toEqual(mockStats)
    })
  })

  describe("getCachedLeaderboard", () => {
    it("should return null when no leaderboard is cached", async () => {
      const result = await getCachedLeaderboard()
      expect(result).toBeNull()
    })

    it("should return cached leaderboard when it exists", async () => {
      await setCachedLeaderboard(mockLeaderboard)
      const result = await getCachedLeaderboard()
      expect(result).toEqual(mockLeaderboard)
    })

    it("should call chrome.storage.local.get with correct key", async () => {
      await getCachedLeaderboard()
      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        "gitty:leaderboard"
      )
    })
  })

  describe("setCachedLeaderboard", () => {
    it("should write leaderboard to chrome.storage.local with correct key", async () => {
      await setCachedLeaderboard(mockLeaderboard)
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        "gitty:leaderboard": mockLeaderboard
      })
    })

    it("should store the exact CachedLeaderboard object passed in", async () => {
      await setCachedLeaderboard(mockLeaderboard)
      const result = await getCachedLeaderboard()
      expect(result).toEqual(mockLeaderboard)
    })
  })

  describe("clearAllCache", () => {
    it("should remove both stats and leaderboard keys", async () => {
      await setCachedStats(mockStats)
      await setCachedLeaderboard(mockLeaderboard)

      await clearAllCache()

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        "gitty:stats",
        "gitty:leaderboard"
      ])
    })

    it("should result in null when reading after clear", async () => {
      await setCachedStats(mockStats)
      await clearAllCache()

      const stats = await getCachedStats()
      const leaderboard = await getCachedLeaderboard()
      expect(stats).toBeNull()
      expect(leaderboard).toBeNull()
    })
  })
})
