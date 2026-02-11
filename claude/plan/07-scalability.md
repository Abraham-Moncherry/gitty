# Scalability Plan

## Scaling Stages

| Users       | Stage        | Infrastructure                         |
|-------------|--------------|----------------------------------------|
| 0–1,000     | Free tier    | Supabase Free Plan                     |
| 1K–10K      | Growth       | Supabase Pro Plan                      |
| 10K–100K    | Scale        | Supabase Pro + optimizations below     |
| 100K+       | Enterprise   | Supabase Enterprise or self-host       |

## Database Scalability

### Indexing Strategy

Indexes already defined in schema, but here's the reasoning:

```sql
-- Most frequent query: "get today's commits for a user"
CREATE INDEX idx_daily_commits_user_date ON daily_commits(user_id, date DESC);
-- Covers: WHERE user_id = X AND date = Y (exact match)
-- Covers: WHERE user_id = X ORDER BY date DESC (streak calculation)

-- Leaderboard queries: "top users for a period"
CREATE INDEX idx_leaderboard_period_rank ON leaderboard_cache(period, rank ASC);
-- Covers: WHERE period = 'weekly' ORDER BY rank ASC LIMIT 50

-- Friend lookups: "get all friends for a user"
CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);

-- Unread notifications: "get pending notifications"
CREATE INDEX idx_notifications_user_unread ON notification_queue(user_id, read) WHERE read = false;
-- Partial index: only indexes unread notifications (smaller, faster)
```

### Leaderboard Optimization

The leaderboard is the most expensive query if done naively. Strategy:

1. **Materialized leaderboard table** (`leaderboard_cache`)
   - Not a live query — pre-computed every 10 minutes
   - Extensions read from cache, never run the aggregation query
   - pg_cron refreshes it: `SELECT calculate_leaderboard()`

2. **Why not a Postgres materialized view?**
   - Materialized views lock during refresh (blocking reads)
   - A regular table with upserts allows non-blocking updates
   - Can refresh different periods at different frequencies

3. **Refresh frequency by period:**
   ```
   Daily:    every 10 minutes
   Weekly:   every 10 minutes
   Monthly:  every 30 minutes
   All-time: every 60 minutes
   ```

### Partitioning (at scale)

If `daily_commits` grows very large (100K+ users × 365 days = 36M+ rows/year):

```sql
-- Partition by month
CREATE TABLE daily_commits (
  ...
) PARTITION BY RANGE (date);

CREATE TABLE daily_commits_2026_01 PARTITION OF daily_commits
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- etc.
```

This keeps queries fast because they only scan relevant partitions.

## Edge Function Scalability

### Batch sync vs individual sync

**Problem:** If 10K users each trigger `sync-commits` independently, that's 10K Edge Function invocations per sync cycle.

**Solution:** Two modes:
1. **User-triggered sync** — when user opens popup (individual, on-demand)
2. **Batch sync via pg_cron** — every 2 hours, process all users in batches

```
Batch sync:
  1. pg_cron triggers Edge Function with batch flag
  2. Edge Function queries all users who need syncing
  3. Processes in chunks of 50 users
  4. Respects GitHub API rate limits (5,000 req/hour)
  5. Spaces out requests to avoid hitting limits
```

### GitHub API Rate Limiting

```
Authenticated: 5,000 requests/hour per token
Each user sync: ~1-2 API calls

At 10K users (batch every 2 hours):
  10,000 users × 1 call = 10,000 calls / 2 hours = 5,000/hour
  → Right at the limit for a single token

Solution: Each user uses their OWN GitHub token
  → Rate limit is per-user, not per-app
  → 5,000 req/hour per user (more than enough)
```

### Edge Function Cold Starts

Supabase Edge Functions (Deno) have minimal cold start (~50ms). Not a concern unless:
- Functions become very large — keep them small and focused
- Too many concurrent invocations — Supabase handles this with autoscaling on Pro plan

## Caching Strategy

### Extension-side caching (chrome.storage)

```
Cached data:
  - User profile + settings
  - Today's commit count + streak
  - Leaderboard data (top 50 + user's position)
  - Badge list + user's earned badges

Cache invalidation:
  - On popup open: show cached data immediately, fetch fresh in background
  - On sync alarm: update cache with new data
  - On settings change: invalidate affected cache
```

### Server-side caching

- Leaderboard is already cached in `leaderboard_cache` table
- Badge definitions rarely change — can be cached in Edge Function memory
- Supabase PostgREST has built-in HTTP caching headers

## Connection Pooling

Supabase Pro includes PgBouncer for connection pooling:
- Handles thousands of concurrent connections
- Essential when Edge Functions open DB connections per request
- No configuration needed — Supabase manages it

## Monitoring

### Key metrics to track

| Metric                      | Tool                    | Alert threshold        |
|-----------------------------|-------------------------|------------------------|
| Edge Function execution time| Supabase Dashboard      | > 5 seconds avg        |
| Database query time         | Supabase Dashboard      | > 500ms avg            |
| GitHub API rate limit usage | Edge Function logging   | > 80% of limit         |
| Failed syncs                | Edge Function logging   | > 5% failure rate      |
| Active users                | Database query           | For capacity planning   |
| Database size               | Supabase Dashboard      | Approaching plan limit  |

### Logging

```typescript
// In Edge Functions
console.log(JSON.stringify({
  event: 'sync_commits',
  user_id: userId,
  commit_count: count,
  duration_ms: Date.now() - startTime,
  github_rate_remaining: rateLimitHeader
}));
```

Supabase captures Edge Function logs in the dashboard.

## Cost Estimation

| Users  | Supabase Plan | Est. Monthly Cost |
|--------|---------------|-------------------|
| 0–500  | Free          | $0                |
| 500–5K | Pro           | $25/mo            |
| 5K–50K | Pro           | $25–75/mo         |
| 50K+   | Pro + addons  | $75–200/mo        |

Main cost drivers:
- Database size (8GB free, then $0.125/GB)
- Edge Function invocations (500K free, then $2/million)
- Bandwidth (5GB free, then $0.09/GB)
