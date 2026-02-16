# Supabase Edge Functions

All server-side logic runs in Supabase Edge Functions (Deno runtime). This ensures commits are verified server-side and users cannot fake scores.

## Data Sync Strategy: Hybrid (Sync-on-Open + Background Polling)

Instead of pure polling, Gitty uses a hybrid approach for near-instant commit tracking:

| Trigger | When | Delay | Purpose |
|---|---|---|---|
| **Sync on popup open** | User opens the extension | ~1-2 seconds | Fresh data when you check |
| **Background alarm** | Every 30 minutes | Up to 30 min | Keeps badge icon updated |
| **pg_cron batch sync** | Every 2 hours | Up to 2 hours | Catches missed syncs |

### Flow when user opens popup:
```
1. Popup opens → loads cached stats from chrome.storage (instant)
2. Calls sync-commits Edge Function in background
3. Edge Function fetches from GitHub API (~1-2 sec)
4. Writes to daily_commits table
5. Returns fresh stats → UI updates
```

This means: make a commit, open Gitty, see it within 1-2 seconds.

### Future enhancement: GitHub App webhooks
For truly real-time updates (without opening the popup), a GitHub App could receive `push` events via webhooks. This would require:
- Creating a registered GitHub App
- Public webhook endpoint
- App installation flow for users
Not needed for v1 — the hybrid approach provides good UX.

## 1. `sync-commits`

The core function. Called when the popup opens, by background alarm every 30 minutes, and by pg_cron for all users.

### Endpoint
`POST /functions/v1/sync-commits`

### Auth
Requires valid Supabase JWT (user must be logged in).

### Logic

```
1. Get user's GitHub access token from Supabase auth (provider_token)
2. Get user's timezone from users table
3. Calculate "today" in user's timezone
4. Call GitHub API: GET /users/{username}/events?per_page=100
5. Filter events:
   - type === "PushEvent"
   - created_at is within "today" in user's timezone
6. Count unique commits (deduplicate by commit SHA)
7. Extract repo names from events
8. Upsert into daily_commits:
   - user_id, date, commit_count, repos
9. Update users table:
   - total_commits (increment or recalculate)
   - current_streak (check if yesterday also has commits)
   - longest_streak (update if current > longest)
10. Return updated stats to client
```

### GitHub API Details

```
GET https://api.github.com/users/{username}/events
Headers:
  Authorization: Bearer {github_token}
  Accept: application/vnd.github.v3+json

Response: Array of events
Filter for: event.type === "PushEvent"
Commits: event.payload.commits[]
Each commit has: sha, message, author
```

### Streak Calculation

```
function calculateStreak(userId):
  Get all daily_commits for user, ordered by date DESC
  Start from today (or yesterday if today has 0 commits)
  Count consecutive days with commit_count > 0
  Return count
```

## 2. `backfill-history`

Runs once per user, immediately after first sign-up. Imports current year daily data + all-time total so users don't start from zero. Completes in ~2-3 seconds using GitHub's GraphQL API.

### Endpoint
`POST /functions/v1/backfill-history`

### Auth
Requires valid Supabase JWT. Only runs if user has `backfill_completed = false`.

### Strategy: GraphQL over REST

Instead of paginating through hundreds of REST API calls, GitHub's GraphQL API returns an **entire year of daily contribution counts in a single request**. This makes backfill nearly instant.

| Approach           | API calls needed | Time     |
|--------------------|------------------|----------|
| REST (old plan)    | 100s–1000s       | Minutes  |
| GraphQL (new plan) | 2                | ~2-3 sec |

### Logic

```
1. Get user's GitHub token + username
2. Mark backfill_started_at = now()

3. GraphQL Query 1: Current year daily data
   → Returns every day of the current year with contribution count
   → 1 API call = full year of daily granularity

4. GraphQL Query 2: All-time total contributions
   → Returns lifetime contribution count
   → 1 API call

5. For each day in the current year that has contributions:
   → Upsert into daily_commits (user_id, date, commit_count)

6. Calculate from the daily data:
   → current_streak (walk back from today)
   → longest_streak (scan all days in current year)

7. Update users table:
   → total_commits = current year sum (for current year tracking)
   → historical_commits = all-time total - current year sum
   → current_streak, longest_streak

8. Run badge check against the data
9. Mark backfill_completed = true
10. Return stats to client
```

### GraphQL Queries

**Query 1: Current year daily data**

```graphql
query($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
# Variables: { from: "2026-01-01T00:00:00Z", to: "2026-12-31T23:59:59Z" }
```

**Query 2: All-time total**

```graphql
query($username: String!) {
  user(login: $username) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
      }
    }
    # Account creation date (to know how far back history goes)
    createdAt
  }
}
```

### What gets stored

| Data | Where | Source |
|------|-------|--------|
| Daily commit counts for current year | `daily_commits` table (one row per day) | GraphQL Query 1 |
| All-time total (prior years) | `users.historical_commits` | GraphQL Query 2 minus current year |
| Current year total | Sum of `daily_commits` rows | Calculated |

### User Experience

```
1. User signs up → OAuth completes
2. backfill-history runs automatically (2-3 seconds)
3. Dashboard loads with full current year data immediately
4. Badges earned from history shown as a welcome notification
5. No loading spinners, no "importing..." screen needed
```

### Edge Cases

| Case | Handling |
|------|----------|
| User signed up to GitHub this year | All-time = current year, historical_commits = 0 |
| User has 0 contributions | Works fine — just empty daily_commits, streak = 0 |
| GraphQL rate limit (5,000 pts/hr) | These 2 queries cost ~2 points total — not a concern |
| Private repo contributions | GraphQL `contributionsCollection` includes private contributions if the user has enabled "Private contributions" in GitHub settings |
| Jan 1 (new year) | Current year has no data yet — backfill returns empty, historical carries over |
| Backfill already completed | Skip — check `backfill_completed` flag |
| Token expired during backfill | Return error, keep `backfill_completed = false` so it retries on next login |

### Limitation: Private contributions

GitHub's GraphQL `contributionsCollection` only includes private repo contributions if the user has **"Include private contributions on my profile"** enabled in their GitHub settings. We should:
1. Inform users during onboarding to enable this setting
2. Show a tip in settings: "Not seeing all your commits? Enable private contributions on GitHub."

## 3. `calculate-leaderboard`

Refreshes the leaderboard_cache table. Called by pg_cron every 10 minutes.

### Trigger
pg_cron schedule: `*/10 * * * *` (every 10 minutes)

### Logic

```
For each period (daily, weekly, monthly, all_time):
  1. Query daily_commits aggregated by user
     - daily:    WHERE date = CURRENT_DATE
     - weekly:   WHERE date >= date_trunc('week', now())
     - monthly:  WHERE date >= date_trunc('month', now())
     - all_time: users.historical_commits + SUM(daily_commits.commit_count)
  2. Rank users by score using RANK() window function
  3. Upsert into leaderboard_cache
  4. Update updated_at timestamp
```

### SQL for leaderboard refresh

```sql
-- Example: weekly leaderboard
INSERT INTO leaderboard_cache (user_id, period, score, rank)
SELECT
  user_id,
  'weekly',
  SUM(commit_count) as score,
  RANK() OVER (ORDER BY SUM(commit_count) DESC) as rank
FROM daily_commits
WHERE date >= date_trunc('week', now())
GROUP BY user_id
ON CONFLICT (user_id, period)
DO UPDATE SET
  score = EXCLUDED.score,
  rank = EXCLUDED.rank,
  updated_at = now();
```

## 4. `check-notifications`

Checks which users haven't met their daily goal and should be reminded.

### Trigger
pg_cron schedule: `*/30 * * * *` (every 30 minutes)

### Logic

```
1. Get all users where notifications_enabled = true
2. For each user:
   a. Check if current time in user's timezone matches notification_time (±15 min)
   b. Check if user has met daily goal today
   c. If not met and time matches:
      - Insert into a notifications_queue table
      - The extension checks this queue and shows chrome.notification
```

### Why not push directly?

Chrome extensions can't receive server-push. Instead:
- Edge Function writes to `notifications_queue` table
- Extension's background alarm checks the queue every 30 min
- If pending notification found, show it and mark as read

## 5. `manage-friends`

Handles friend requests and friend code lookups.

### Endpoints

```
POST /functions/v1/manage-friends
Body: { action: "send_request", friend_code: "ABCD-1234" }
Body: { action: "accept_request", friendship_id: "uuid" }
Body: { action: "reject_request", friendship_id: "uuid" }
Body: { action: "remove_friend", friend_id: "uuid" }
```

### Friend Code Generation

Each user gets a unique friend code on signup (generated by the `handle_new_user` trigger):
```
Format: XXXX-XXXX (uppercase alphanumeric)
```

## pg_cron Schedule Summary

| Job                    | Schedule         | Function                  |
|------------------------|------------------|---------------------------|
| Sync all users         | `0 */2 * * *`    | sync-commits (batch)      |
| Refresh leaderboard    | `*/10 * * * *`   | calculate-leaderboard     |
| Check notifications    | `*/30 * * * *`   | check-notifications       |
| Clean old notifications| `0 0 * * *`      | DELETE WHERE created_at < now() - interval '7 days' |
