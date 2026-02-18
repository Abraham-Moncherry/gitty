import type { User, Badge, UserBadge } from "~lib/types"
import type { CachedStats, CachedLeaderboard } from "~lib/storage"

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-123",
    github_username: "testuser",
    avatar_url: "https://avatars.githubusercontent.com/u/1",
    display_name: "Test User",
    daily_goal: 5,
    notifications_enabled: true,
    notification_time: "20:00:00",
    timezone: "America/New_York",
    total_commits: 42,
    historical_commits: 100,
    current_streak: 7,
    longest_streak: 14,
    friend_code: "ABCD-1234",
    backfill_completed: true,
    backfill_started_at: null,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-02-16T00:00:00Z",
    ...overrides
  }
}

export function createMockSession(userId = "user-123") {
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    expires_in: 3600,
    token_type: "bearer" as const,
    user: {
      id: userId,
      email: "test@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-15T00:00:00Z"
    }
  }
}

export function createMockStats(
  overrides: Partial<CachedStats> = {}
): CachedStats {
  return {
    todayCommits: 3,
    dailyGoal: 5,
    goalMet: false,
    currentStreak: 7,
    longestStreak: 14,
    totalScore: 142,
    weeklyCommits: [
      { date: "2026-02-16", count: 5 },
      { date: "2026-02-17", count: 3 },
      { date: "2026-02-18", count: 7 }
    ],
    rank: 42,
    lastFetched: Date.now(),
    ...overrides
  }
}

export function createMockLeaderboard(
  overrides: Partial<CachedLeaderboard> = {}
): CachedLeaderboard {
  return {
    period: "weekly",
    scope: "global",
    entries: [
      {
        userId: "user-1",
        displayName: "Alice",
        githubUsername: "alice",
        avatarUrl: "https://avatars.githubusercontent.com/u/1",
        score: 892,
        rank: 1
      },
      {
        userId: "user-2",
        displayName: "Bob",
        githubUsername: "bob",
        avatarUrl: null,
        score: 756,
        rank: 2
      },
      {
        userId: "user-123",
        displayName: "Test User",
        githubUsername: "testuser",
        avatarUrl: "https://avatars.githubusercontent.com/u/3",
        score: 523,
        rank: 42
      }
    ],
    lastFetched: Date.now(),
    ...overrides
  }
}

export function createMockBadge(overrides: Partial<Badge> = {}): Badge {
  return {
    id: "badge-1",
    slug: "first-commit",
    name: "First Blood",
    description: "Make your first commit",
    icon: "🎯",
    category: "commits",
    requirement_type: "total_commits",
    requirement_value: 1,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides
  }
}

export function createMockUserBadge(
  overrides: Partial<UserBadge> = {}
): UserBadge {
  return {
    id: "ub-1",
    user_id: "user-123",
    badge_id: "badge-1",
    earned_at: "2026-02-01T00:00:00Z",
    ...overrides
  }
}
