export interface CachedStats {
  todayCommits: number
  dailyGoal: number
  goalMet: boolean
  currentStreak: number
  longestStreak: number
  totalScore: number
  weeklyCommits: { date: string; count: number }[]
  rank: number | null
  lastFetched: number
}

export interface CachedLeaderboard {
  period: string
  scope: string
  entries: Array<{
    userId: string
    displayName: string | null
    githubUsername: string
    avatarUrl: string | null
    score: number
    rank: number
  }>
  lastFetched: number
}

const KEYS = {
  STATS: "gitty:stats",
  LEADERBOARD: "gitty:leaderboard"
} as const

export async function getCachedStats(): Promise<CachedStats | null> {
  const result = await chrome.storage.local.get(KEYS.STATS)
  return result[KEYS.STATS] ?? null
}

export async function setCachedStats(stats: CachedStats): Promise<void> {
  await chrome.storage.local.set({ [KEYS.STATS]: stats })
}

export async function getCachedLeaderboard(): Promise<CachedLeaderboard | null> {
  const result = await chrome.storage.local.get(KEYS.LEADERBOARD)
  return result[KEYS.LEADERBOARD] ?? null
}

export async function setCachedLeaderboard(data: CachedLeaderboard): Promise<void> {
  await chrome.storage.local.set({ [KEYS.LEADERBOARD]: data })
}

export async function clearAllCache(): Promise<void> {
  await chrome.storage.local.remove(Object.values(KEYS))
}
