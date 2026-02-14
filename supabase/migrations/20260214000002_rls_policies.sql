-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS
-- ============================================

-- Public profiles are readable (for leaderboard display)
CREATE POLICY "Public profiles are readable"
  ON users FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- DAILY COMMITS
-- ============================================

-- Users can read their own commits
CREATE POLICY "Users can read own commits"
  ON daily_commits FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for authenticated users
-- Only Edge Functions (service_role) can write

-- ============================================
-- FRIENDSHIPS
-- ============================================

-- Users can read friendships they're part of
CREATE POLICY "Users can read own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can send friend requests
CREATE POLICY "Users can create friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Users can respond to requests sent to them
CREATE POLICY "Users can update requests sent to them"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

-- ============================================
-- BADGES
-- ============================================

-- Badge definitions are public
CREATE POLICY "Badges are publicly readable"
  ON badges FOR SELECT
  USING (true);

-- ============================================
-- USER BADGES
-- ============================================

-- Earned badges are publicly visible (gamification)
CREATE POLICY "User badges are publicly readable"
  ON user_badges FOR SELECT
  USING (true);

-- ============================================
-- LEADERBOARD CACHE
-- ============================================

-- Leaderboard is public by design
CREATE POLICY "Leaderboard is publicly readable"
  ON leaderboard_cache FOR SELECT
  USING (true);

-- ============================================
-- NOTIFICATION QUEUE
-- ============================================

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON notification_queue FOR SELECT
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
  ON notification_queue FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
