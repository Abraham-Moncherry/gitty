-- ============================================
-- Harder badge thresholds + Lucide icon names
-- ============================================

DELETE FROM user_badges;
DELETE FROM badges;

INSERT INTO badges (slug, name, description, icon, category, requirement_type, requirement_value) VALUES
  -- Commit milestones (much harder)
  ('first-commit',   'First Blood',      'Reach 50 total commits',               'target',         'commits', 'total_commits', 50),
  ('commits-250',    'Apprentice',       'Reach 250 total commits',              'git-commit',     'commits', 'total_commits', 250),
  ('commits-1000',   'Dedicated',        'Reach 1,000 total commits',            'code',           'commits', 'total_commits', 1000),
  ('commits-2500',   'Veteran',          'Reach 2,500 total commits',            'shield',         'commits', 'total_commits', 2500),
  ('commits-5000',   'Machine',          'Reach 5,000 total commits',            'cpu',            'commits', 'total_commits', 5000),
  ('commits-10000',  'Legend',           'Reach 10,000 total commits',           'trophy',         'commits', 'total_commits', 10000),
  -- Streak milestones (harder)
  ('streak-7',       'Consistent',       'Maintain a 7-day streak',              'flame',          'streaks', 'streak', 7),
  ('streak-14',      'On Fire',          'Maintain a 14-day streak',             'zap',            'streaks', 'streak', 14),
  ('streak-30',      'Unstoppable',      'Maintain a 30-day streak',             'swords',         'streaks', 'streak', 30),
  ('streak-90',      'Iron Will',        'Maintain a 90-day streak',             'crown',          'streaks', 'streak', 90),
  ('streak-180',     'Half Year Hero',   'Maintain a 180-day streak',            'gem',            'streaks', 'streak', 180),
  ('streak-365',     'Year of Code',     'Maintain a 365-day streak',            'calendar-check', 'streaks', 'streak', 365),
  -- Daily commit milestones (harder)
  ('daily-20',       'Productive Day',   'Make 20 commits in a single day',      'trending-up',    'commits', 'daily_commits', 20),
  ('daily-50',       'Commit Spree',     'Make 50 commits in a single day',      'rocket',         'commits', 'daily_commits', 50),
  -- Social milestones (harder)
  ('friends-5',      'Networker',        'Have 5 friends',                       'users',          'social', 'friends', 5),
  ('friends-25',     'Popular',          'Have 25 friends',                      'sparkles',       'social', 'friends', 25);
