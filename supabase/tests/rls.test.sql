-- Tests for Row Level Security policies using pgTAP
-- Run with: supabase db test

BEGIN;

SELECT plan(10);

-- ── Setup test users ─────────────────────────────────────────

INSERT INTO auth.users (id, email, created_at, aud, role)
VALUES
  ('00000000-0000-0000-0000-000000000aaa', 'usera@test.com', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000bbb', 'userb@test.com', now(), 'authenticated', 'authenticated');

-- Wait for handle_new_user trigger to create public.users rows
-- Insert test data
INSERT INTO daily_commits (user_id, date, commit_count)
VALUES
  ('00000000-0000-0000-0000-000000000aaa', CURRENT_DATE, 5),
  ('00000000-0000-0000-0000-000000000bbb', CURRENT_DATE, 3);

INSERT INTO friendships (requester_id, addressee_id, status)
VALUES ('00000000-0000-0000-0000-000000000aaa', '00000000-0000-0000-0000-000000000bbb', 'pending');

INSERT INTO notification_queue (user_id, type, title, body)
VALUES
  ('00000000-0000-0000-0000-000000000aaa', 'goal_reminder', 'Keep going!', 'You have 2 commits left'),
  ('00000000-0000-0000-0000-000000000bbb', 'badge_earned', 'New badge!', 'You earned First Blood');

-- ── Test as User A ───────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aaa"}';

-- Test 1: Users can read all profiles (public)
SELECT isnt_empty(
  $$ SELECT * FROM users $$,
  'authenticated user can read all user profiles'
);

-- Test 2: Users can read own daily_commits
SELECT is(
  (SELECT count(*)::int FROM daily_commits WHERE user_id = '00000000-0000-0000-0000-000000000aaa'),
  1,
  'user A can read own daily_commits'
);

-- Test 3: Users cannot read other users daily_commits
SELECT is(
  (SELECT count(*)::int FROM daily_commits WHERE user_id = '00000000-0000-0000-0000-000000000bbb'),
  0,
  'user A cannot read user B daily_commits'
);

-- Test 4: Users can read own friendships
SELECT is(
  (SELECT count(*)::int FROM friendships
   WHERE requester_id = '00000000-0000-0000-0000-000000000aaa'),
  1,
  'user A can read friendships they requested'
);

-- Test 5: Badges are publicly readable
SELECT isnt_empty(
  $$ SELECT * FROM badges $$,
  'authenticated user can read all badges'
);

-- Test 6: Leaderboard is publicly readable
SELECT lives_ok(
  $$ SELECT * FROM leaderboard_cache $$,
  'authenticated user can query leaderboard_cache'
);

-- Test 7: Users can read own notifications
SELECT is(
  (SELECT count(*)::int FROM notification_queue
   WHERE user_id = '00000000-0000-0000-0000-000000000aaa'),
  1,
  'user A can read own notifications'
);

-- Test 8: Users cannot read other users notifications
SELECT is(
  (SELECT count(*)::int FROM notification_queue
   WHERE user_id = '00000000-0000-0000-0000-000000000bbb'),
  0,
  'user A cannot read user B notifications'
);

-- ── Test as User B ───────────────────────────────────────────

SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000bbb"}';

-- Test 9: Addressee can update friend request status
SELECT lives_ok(
  $$ UPDATE friendships SET status = 'accepted'
     WHERE addressee_id = '00000000-0000-0000-0000-000000000bbb' $$,
  'addressee (user B) can update friend request sent to them'
);

-- Test 10: User badges are publicly readable
SELECT lives_ok(
  $$ SELECT * FROM user_badges $$,
  'authenticated user can read all user_badges'
);

SELECT * FROM finish();

ROLLBACK;
