# Gamification System

## Scoring

### Points

| Action                | Points |
|-----------------------|--------|
| Each commit           | 1 pt   |

Simple and transparent. 1 commit = 1 point. No weighting by repo, language, or size — keeps it fair and easy to understand.

### Score periods

- **Daily** — commits today
- **Weekly** — commits this week (Mon-Sun)
- **Monthly** — commits this month
- **All-time** — `historical_commits` (prior years) + current year `total_commits`

### Data sources for scoring

| Period     | Source                              | Includes pre-signup data? |
|------------|-------------------------------------|---------------------------|
| Daily      | `daily_commits` row for today       | Yes (backfilled from GraphQL) |
| Weekly     | Sum of `daily_commits` this week    | Yes |
| Monthly    | Sum of `daily_commits` this month   | Yes |
| All-time   | `users.historical_commits` + `users.total_commits` | Yes |

Current year daily data is backfilled via GitHub GraphQL API on signup (2 API calls, ~2 seconds). This means leaderboards are fair from day one — a user who joins in June has their Jan-May commits already counted.

## Streaks

### How streaks work

A streak is the number of **consecutive days** with at least 1 commit.

```
Rules:
- Streak increments when you commit on a new consecutive day
- Streak resets to 0 if you miss a full day (in your timezone)
- Today counts: if you haven't committed yet today, streak is still alive
  (it only breaks at the END of a day with 0 commits)
- Streak is calculated in the user's configured timezone
```

### Streak calculation logic

```
On each sync:
  1. Get all daily_commits for user, ordered by date DESC
  2. If today has commits → start counting from today
  3. If today has NO commits → start counting from yesterday
     (today is still in progress, so streak isn't broken yet)
  4. Walk backwards counting consecutive days with commit_count > 0
  5. Update users.current_streak
  6. If current_streak > longest_streak → update longest_streak
```

### Streak freeze (future feature)

Like Duolingo's streak freeze — allow users to protect their streak for 1 missed day. Not in v1 but good to keep in mind.

## Badges

### Badge categories

| Category   | Based on            | Examples                          |
|------------|---------------------|-----------------------------------|
| Commits    | Total commit count  | First Blood (1), Centurion (100)  |
| Streaks    | Streak length       | On Fire (7), Year of Code (365)   |
| Daily      | Commits in one day  | Productive Day (10)               |
| Social     | Friend count        | Social Coder (1), Popular (10)    |

### Badge checking

Badges are checked automatically via database trigger (see 02-database-schema.md):
- After every `daily_commits` upsert, the trigger checks all badge requirements
- Uses `ON CONFLICT DO NOTHING` so badges are only awarded once
- When a new badge is earned, a notification is queued

### Badge display

- Show all badges in a grid
- Earned badges: full color with checkmark + earned date
- Unearned badges: greyed out with progress indicator (e.g., "42/100 commits")
- Progress percentage for the next unearned badge in each category

## Leaderboards

### Global leaderboard

- All users ranked by score for the selected period
- Show top 50 + user's own position (with surrounding 5 users)
- Refreshed every 10 minutes via pg_cron

### Friends leaderboard

- Same as global but filtered to accepted friends + self
- Uses the friendships table (status = 'accepted')
- Query:

```sql
SELECT
  lc.user_id,
  u.display_name,
  u.avatar_url,
  lc.score,
  lc.rank
FROM leaderboard_cache lc
JOIN users u ON u.id = lc.user_id
WHERE lc.period = 'weekly'
  AND (
    lc.user_id = {current_user_id}
    OR lc.user_id IN (
      SELECT CASE
        WHEN requester_id = {current_user_id} THEN addressee_id
        ELSE requester_id
      END
      FROM friendships
      WHERE status = 'accepted'
        AND (requester_id = {current_user_id} OR addressee_id = {current_user_id})
    )
  )
ORDER BY lc.score DESC;
```

### Leaderboard display

- Medal icons for top 3 (gold, silver, bronze)
- Highlight current user's row
- Show rank change arrows (up/down from previous period) — future feature

## Daily Goal

### Configuration

- Users set a daily commit goal (default: 5)
- Stored in `users.daily_goal`
- Progress shown as a progress bar on the home screen

### Goal completion

- When `commit_count >= daily_goal` for today, `goal_met` is set to `true`
- Visual celebration in the popup (confetti animation or green checkmark)
- Contributes to potential future "goal streak" badge

## Notifications

### Types

| Type             | When                                      | Message example                           |
|------------------|-------------------------------------------|-------------------------------------------|
| Daily reminder   | At user's configured time, if goal not met | "You have 2/5 commits today. Keep going!" |
| Badge earned     | After sync detects new badge              | "You earned the 'On Fire' badge! 🔥"       |
| Friend request   | When someone sends a friend request       | "alice wants to be your friend!"          |
| Streak warning   | Evening, if 0 commits today              | "Don't lose your 12-day streak!"          |

### Delivery

Chrome extension notifications via `chrome.notifications.create()`:
```typescript
chrome.notifications.create('daily-reminder', {
  type: 'basic',
  iconUrl: 'icon-128.png',
  title: 'Gitty',
  message: "You have 2/5 commits today. Keep going!",
  priority: 1
})
```
