-- ============================================
-- Gitty Database Schema
-- Migration: Create all tables, indexes, triggers, and seed data
-- ============================================

-- ============================================
-- 1. TABLES
-- ============================================

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  github_username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  display_name TEXT,
  daily_goal INTEGER NOT NULL DEFAULT 5,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_time TIME NOT NULL DEFAULT '20:00:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  total_commits INTEGER NOT NULL DEFAULT 0,
  historical_commits INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  friend_code TEXT UNIQUE,
  backfill_completed BOOLEAN NOT NULL DEFAULT false,
  backfill_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily commits (one row per user per day)
CREATE TABLE daily_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  commit_count INTEGER NOT NULL DEFAULT 0,
  repos JSONB NOT NULL DEFAULT '[]',
  goal_met BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_commits_user_date ON daily_commits(user_id, date DESC);
CREATE INDEX idx_daily_commits_date ON daily_commits(date DESC);

-- Friendships
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);

-- Badge definitions (seeded, immutable)
CREATE TABLE badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('commits', 'streaks', 'social', 'special')),
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('total_commits', 'streak', 'daily_commits', 'friends')),
  requirement_value INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User badges (earned badges)
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);

-- Leaderboard cache (refreshed periodically)
CREATE TABLE leaderboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'all_time')),
  score INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period)
);

CREATE INDEX idx_leaderboard_period_rank ON leaderboard_cache(period, rank ASC);

-- Notification queue
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('goal_reminder', 'streak_warning', 'badge_earned', 'friend_request')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notification_queue(user_id, read) WHERE read = false;

-- ============================================
-- 2. TRIGGERS
-- ============================================

-- Auto-update updated_at on users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update goal_met based on user's daily_goal
CREATE OR REPLACE FUNCTION update_goal_met()
RETURNS TRIGGER AS $$
DECLARE
  user_goal INTEGER;
BEGIN
  SELECT daily_goal INTO user_goal FROM users WHERE id = NEW.user_id;
  NEW.goal_met = NEW.commit_count >= user_goal;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_goal_met
  BEFORE INSERT OR UPDATE ON daily_commits
  FOR EACH ROW EXECUTE FUNCTION update_goal_met();

-- Auto-check badges when commits are synced
CREATE OR REPLACE FUNCTION check_badges_on_commit()
RETURNS TRIGGER AS $$
DECLARE
  u RECORD;
  b RECORD;
BEGIN
  SELECT total_commits + historical_commits AS total_commits, current_streak
    INTO u FROM users WHERE id = NEW.user_id;

  -- Check total commit badges
  FOR b IN SELECT id, requirement_value FROM badges WHERE requirement_type = 'total_commits' LOOP
    IF u.total_commits >= b.requirement_value THEN
      INSERT INTO user_badges (user_id, badge_id) VALUES (NEW.user_id, b.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- Check streak badges
  FOR b IN SELECT id, requirement_value FROM badges WHERE requirement_type = 'streak' LOOP
    IF u.current_streak >= b.requirement_value THEN
      INSERT INTO user_badges (user_id, badge_id) VALUES (NEW.user_id, b.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- Check daily commit badges
  FOR b IN SELECT id, requirement_value FROM badges WHERE requirement_type = 'daily_commits' LOOP
    IF NEW.commit_count >= b.requirement_value THEN
      INSERT INTO user_badges (user_id, badge_id) VALUES (NEW.user_id, b.id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_badges_after_sync
  AFTER INSERT OR UPDATE ON daily_commits
  FOR EACH ROW EXECUTE FUNCTION check_badges_on_commit();

-- ============================================
-- 3. SEED DATA — Badges
-- ============================================

INSERT INTO badges (slug, name, description, icon, category, requirement_type, requirement_value) VALUES
  -- Commit milestones
  ('first-commit',   'First Blood',      'Make your first commit',            '🎯', 'commits', 'total_commits', 1),
  ('commits-10',     'Getting Started',  'Reach 10 total commits',           '🌱', 'commits', 'total_commits', 10),
  ('commits-50',     'Half Century',     'Reach 50 total commits',           '⭐', 'commits', 'total_commits', 50),
  ('commits-100',    'Centurion',        'Reach 100 total commits',          '💯', 'commits', 'total_commits', 100),
  ('commits-500',    'Machine',          'Reach 500 total commits',          '🤖', 'commits', 'total_commits', 500),
  ('commits-1000',   'Legend',           'Reach 1000 total commits',         '🏆', 'commits', 'total_commits', 1000),
  -- Streak milestones
  ('streak-3',       'Hat Trick',        'Maintain a 3-day streak',          '🔥', 'streaks', 'streak', 3),
  ('streak-7',       'On Fire',          'Maintain a 7-day streak',          '🔥', 'streaks', 'streak', 7),
  ('streak-14',      'Unstoppable',      'Maintain a 14-day streak',         '⚡', 'streaks', 'streak', 14),
  ('streak-30',      'Monthly Master',   'Maintain a 30-day streak',         '👑', 'streaks', 'streak', 30),
  ('streak-100',     'Hundred Days',     'Maintain a 100-day streak',        '💎', 'streaks', 'streak', 100),
  ('streak-365',     'Year of Code',     'Maintain a 365-day streak',        '🗓️', 'streaks', 'streak', 365),
  -- Daily commit milestones
  ('daily-10',       'Productive Day',   'Make 10 commits in a single day',  '📈', 'commits', 'daily_commits', 10),
  ('daily-25',       'Commit Spree',     'Make 25 commits in a single day',  '🚀', 'commits', 'daily_commits', 25),
  -- Social milestones
  ('friends-1',      'Social Coder',     'Add your first friend',            '🤝', 'social', 'friends', 1),
  ('friends-10',     'Popular',          'Have 10 friends',                  '🌟', 'social', 'friends', 10);
