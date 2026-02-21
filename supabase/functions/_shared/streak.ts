interface DayRecord {
  date: string // YYYY-MM-DD
  commit_count: number
}

interface StreakResult {
  currentStreak: number
  longestStreak: number
}

export function calculateStreaks(
  days: DayRecord[],
  todayStr: string
): StreakResult {
  const withCommits = days.filter((d) => d.commit_count > 0)

  if (withCommits.length === 0) {
    return { currentStreak: 0, longestStreak: 0 }
  }

  // Set of dates with commits for O(1) lookup
  const commitDates = new Set(withCommits.map((d) => d.date))

  // Current streak: walk backwards from today (or yesterday if today has 0)
  let currentStreak = 0
  const checkDate = new Date(todayStr + "T00:00:00")

  if (!commitDates.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1)
  }

  while (true) {
    const dateStr = checkDate.toISOString().split("T")[0]
    if (commitDates.has(dateStr)) {
      currentStreak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  // Longest streak: scan all days chronologically
  const allDates = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const startDate = new Date(allDates[0].date + "T00:00:00")
  const endDate = new Date(todayStr + "T00:00:00")

  let longestStreak = 0
  let tempStreak = 0
  const cursor = new Date(startDate)

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().split("T")[0]
    if (commitDates.has(dateStr)) {
      tempStreak++
      longestStreak = Math.max(longestStreak, tempStreak)
    } else {
      tempStreak = 0
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  longestStreak = Math.max(longestStreak, currentStreak)

  return { currentStreak, longestStreak }
}

/** Get "today" as YYYY-MM-DD in the user's timezone */
export function getTodayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone })
}
