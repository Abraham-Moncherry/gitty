export interface User {
  id: string
  github_username: string
  avatar_url: string | null
  display_name: string | null
  daily_goal: number
  notifications_enabled: boolean
  notification_time: string
  timezone: string
  total_commits: number
  historical_commits: number
  current_streak: number
  longest_streak: number
  backfill_completed: boolean
  backfill_started_at: string | null
  created_at: string
  updated_at: string
}

export interface DailyCommit {
  id: string
  user_id: string
  date: string
  commit_count: number
  repos: string[]
  goal_met: boolean
  synced_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: "pending" | "accepted" | "rejected"
  created_at: string
}

export interface Badge {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  category: "commits" | "streaks" | "social" | "special"
  requirement_type: "total_commits" | "streak" | "daily_commits" | "friends"
  requirement_value: number
  created_at: string
}

export interface UserBadge {
  id: string
  user_id: string
  badge_id: string
  earned_at: string
}

export interface LeaderboardEntry {
  id: string
  user_id: string
  period: "daily" | "weekly" | "monthly" | "all_time"
  score: number
  rank: number
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: "daily_reminder" | "badge_earned" | "friend_request"
  title: string
  body: string
  read: boolean
  created_at: string
}
