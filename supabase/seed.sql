-- ============================================
-- Seed data for testing friend functionality
-- Run: supabase db reset (applies migrations + seed)
-- ============================================

-- Create mock auth users first (Supabase requires auth.users entries)
-- These UUIDs are deterministic for easy reference in tests
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at, instance_id, aud, role)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'alice@test.com',
    '{"user_name": "alice-dev", "avatar_url": "https://avatars.githubusercontent.com/u/100000001", "full_name": "Sarah Chen"}'::jsonb,
    now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'bob@test.com',
    '{"user_name": "bob-codes", "avatar_url": "https://avatars.githubusercontent.com/u/100000002", "full_name": "Marcus Rivera"}'::jsonb,
    now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'charlie@test.com',
    '{"user_name": "charlie-git", "avatar_url": "https://avatars.githubusercontent.com/u/100000003", "full_name": "Priya Patel"}'::jsonb,
    now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  );

-- The handle_new_user trigger auto-creates public.users rows,
-- but we override friend_codes to known values for testing.
UPDATE users SET friend_code = 'TEST-0001' WHERE id = '00000000-0000-0000-0000-000000000001';
UPDATE users SET friend_code = 'TEST-0002' WHERE id = '00000000-0000-0000-0000-000000000002';
UPDATE users SET friend_code = 'TEST-0003' WHERE id = '00000000-0000-0000-0000-000000000003';

-- Pre-existing friendship: Alice and Bob are already friends
INSERT INTO friendships (requester_id, addressee_id, status)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted');

-- Pending request: Bob sent Charlie a request (not yet accepted)
INSERT INTO friendships (requester_id, addressee_id, status)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'pending');

-- ============================================
-- Test scenarios (manual):
--
-- 1. VALID CODE:      Sign in as Charlie, add friend code "TEST-0001" -> should send request to Alice
-- 2. INVALID CODE:    Enter "XXXX-9999"                                -> "Invalid friend code" error
-- 3. ADD YOURSELF:    Sign in as Alice, enter "TEST-0001"              -> "Cannot add yourself" error
-- 4. ALREADY FRIENDS: Sign in as Alice, enter "TEST-0002"              -> "Already friends" error
-- 5. ALREADY PENDING: Sign in as Bob, enter "TEST-0003"                -> "Friend request already pending" error
-- 6. ACCEPT REQUEST:  Sign in as Charlie, accept Bob's pending request -> becomes friends
-- 7. REJECT REQUEST:  Sign in as Charlie, reject Bob's pending request -> request rejected
-- 8. REMOVE FRIEND:   Sign in as Alice, remove Bob                     -> friendship deleted
-- ============================================
