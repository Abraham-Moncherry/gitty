# Security Plan

## Threat Model

As a Chrome extension with GitHub OAuth and a Supabase backend, the main attack surfaces are:

1. **Exposed API keys** — extension code is client-side and inspectable
2. **Score tampering** — users faking commit counts
3. **Unauthorized data access** — users reading/modifying other users' data
4. **Token theft** — GitHub OAuth tokens being leaked
5. **XSS in extension** — malicious content injected into the popup

## Mitigations

### 1. API Key Exposure

**Problem:** The Supabase `anon` key is bundled in the extension. Anyone can extract it.

**Solution:** This is expected and safe IF Row Level Security (RLS) is enabled.
- The `anon` key alone can't do anything harmful
- Every database operation must pass RLS policies
- The key is essentially a "namespace" identifier, not a secret

**Rule:** Never put the Supabase `service_role` key in the extension. It bypasses RLS. Only use it in Edge Functions (server-side).

### 2. Score Tampering Prevention

**Problem:** A malicious user could call the Supabase API directly and insert fake commit counts.

**Solution:** Users cannot write to `daily_commits` directly.

```sql
-- RLS on daily_commits: users can only READ their own data
-- Only the service_role (Edge Functions) can WRITE
CREATE POLICY "Users can read own commits"
  ON daily_commits FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for authenticated users
-- Only Edge Functions (using service_role key) can write
```

The flow is:
```
Extension → calls sync-commits Edge Function → Edge Function verifies with GitHub API → writes to DB
```

Users never write scores directly. The Edge Function is the single source of truth.

### 3. Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    -- Only allow updating these fields
    auth.uid() = id
  );

-- Users can read other users' basic info (for leaderboard)
CREATE POLICY "Users can read public profiles"
  ON users FOR SELECT
  USING (true);  -- display_name, avatar_url, github_username are not sensitive

-- DAILY COMMITS
CREATE POLICY "Users can read own commits"
  ON daily_commits FOR SELECT
  USING (auth.uid() = user_id);

-- No write policy — only Edge Functions write via service_role

-- FRIENDSHIPS
CREATE POLICY "Users can read own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can create friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update requests sent to them"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id);

-- LEADERBOARD CACHE
CREATE POLICY "Leaderboard is publicly readable"
  ON leaderboard_cache FOR SELECT
  USING (true);  -- leaderboard is public by design

-- BADGES
CREATE POLICY "Badges are publicly readable"
  ON badges FOR SELECT
  USING (true);  -- badge definitions are public

-- USER BADGES
CREATE POLICY "User badges are publicly readable"
  ON user_badges FOR SELECT
  USING (true);  -- showing what badges users earned is part of gamification

-- NOTIFICATION QUEUE
CREATE POLICY "Users can read own notifications"
  ON notification_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mark own notifications as read"
  ON notification_queue FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 4. GitHub Token Security

**Problem:** We have users' GitHub OAuth tokens. These are sensitive.

**Solution:**
- Supabase stores the `provider_token` server-side in `auth.users` (not accessible via client API)
- The extension never sees or handles the GitHub token directly
- Only Edge Functions (server-side) access the token to call GitHub API
- If Supabase session expires, user re-authenticates — no token stored in extension

**OAuth Scopes — Principle of Least Privilege:**
```
read:user    — read user profile info
repo:status  — access commit status (not full repo access)
```

We do NOT request `repo` (full access) or `write` scopes.

### 5. XSS Prevention

**Problem:** If any user-controlled data (commit messages, usernames) is rendered in the popup, it could contain malicious scripts.

**Solution:**
- React escapes all rendered strings by default
- Never use `dangerouslySetInnerHTML`
- Sanitize any data before display (usernames, commit messages)
- Content Security Policy in manifest:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none';"
  }
}
```

### 6. Rate Limiting

- Supabase has built-in rate limiting on auth and API endpoints
- Edge Functions: add per-user rate limiting (max 1 sync per 5 minutes per user)
- GitHub API: respect rate limits (5,000 requests/hour for authenticated users)

```typescript
// In Edge Function
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Check last sync time before proceeding
const { data: lastSync } = await supabase
  .from('daily_commits')
  .select('synced_at')
  .eq('user_id', userId)
  .order('synced_at', { ascending: false })
  .limit(1)
  .single();

if (lastSync && Date.now() - new Date(lastSync.synced_at).getTime() < SYNC_COOLDOWN_MS) {
  return new Response('Rate limited', { status: 429 });
}
```

## Security Checklist

- [ ] RLS enabled on ALL tables
- [ ] No `service_role` key in extension code
- [ ] GitHub tokens never exposed to client
- [ ] Edge Functions validate all inputs
- [ ] Commit counts verified server-side via GitHub API
- [ ] Minimal OAuth scopes requested
- [ ] CSP configured in manifest
- [ ] Rate limiting on sync endpoint
- [ ] No `dangerouslySetInnerHTML` usage
- [ ] All user input sanitized before display
