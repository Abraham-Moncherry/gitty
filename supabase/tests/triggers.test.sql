-- Tests for database triggers using pgTAP
-- Run with: supabase db test

BEGIN;

SELECT plan(8);

-- ── Setup test data ──────────────────────────────────────────

-- Create a test user in auth.users to trigger handle_new_user
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, aud, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@example.com',
  '{"user_name": "testuser", "avatar_url": "https://example.com/avatar.png", "full_name": "Test User"}'::jsonb,
  now(),
  'authenticated',
  'authenticated'
);

-- ── Test 1: handle_new_user creates public.users row ─────────

SELECT isnt_empty(
  $$ SELECT * FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001' $$,
  'handle_new_user should create a public.users row on auth signup'
);

-- ── Test 2: handle_new_user extracts github_username ─────────

SELECT is(
  (SELECT github_username FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001'),
  'testuser',
  'handle_new_user should extract github_username from user_name metadata'
);

-- ── Test 3: handle_new_user generates friend_code ────────────

SELECT matches(
  (SELECT friend_code FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001'),
  '^[A-F0-9]{4}-[A-F0-9]{4}$',
  'friend_code should be in XXXX-XXXX hex format'
);

-- ── Test 4: update_updated_at trigger ────────────────────────

-- Record initial updated_at
DO $$ BEGIN PERFORM pg_sleep(0.1); END $$;

UPDATE public.users
SET daily_goal = 10
WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT ok(
  (SELECT updated_at > created_at FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001'),
  'updated_at should be later than created_at after update'
);

-- ── Test 5: update_goal_met trigger (goal NOT met) ───────────

INSERT INTO daily_commits (user_id, date, commit_count)
VALUES ('00000000-0000-0000-0000-000000000001', CURRENT_DATE, 3);

SELECT is(
  (SELECT goal_met FROM daily_commits
   WHERE user_id = '00000000-0000-0000-0000-000000000001' AND date = CURRENT_DATE),
  false,
  'goal_met should be false when commit_count (3) < daily_goal (10)'
);

-- ── Test 6: update_goal_met trigger (goal MET) ──────────────

UPDATE daily_commits
SET commit_count = 10
WHERE user_id = '00000000-0000-0000-0000-000000000001' AND date = CURRENT_DATE;

SELECT is(
  (SELECT goal_met FROM daily_commits
   WHERE user_id = '00000000-0000-0000-0000-000000000001' AND date = CURRENT_DATE),
  true,
  'goal_met should be true when commit_count (10) >= daily_goal (10)'
);

-- ── Test 7: check_badges_on_commit awards total_commits badge ─

-- Set total_commits >= 1 to qualify for first-commit badge
UPDATE public.users
SET total_commits = 1
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Trigger badge check by updating daily_commits
UPDATE daily_commits
SET commit_count = 10
WHERE user_id = '00000000-0000-0000-0000-000000000001' AND date = CURRENT_DATE;

SELECT isnt_empty(
  $$ SELECT ub.* FROM user_badges ub
     JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = '00000000-0000-0000-0000-000000000001'
       AND b.slug = 'first-commit' $$,
  'first-commit badge should be awarded when total_commits >= 1'
);

-- ── Test 8: check_badges_on_commit awards daily_commits badge ─

-- daily-10 badge requires 10 commits in a single day
SELECT isnt_empty(
  $$ SELECT ub.* FROM user_badges ub
     JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = '00000000-0000-0000-0000-000000000001'
       AND b.slug = 'daily-10' $$,
  'daily-10 badge should be awarded when commit_count >= 10'
);

SELECT * FROM finish();

ROLLBACK;
