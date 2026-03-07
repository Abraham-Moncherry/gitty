#!/usr/bin/env bash
# ============================================
# Friend & notification test script
# Simulates friend and notification scenarios against the local Supabase DB
# Usage: ./scripts/test-friends.sh [reset|status|send|accept|reject|remove|notify|notif-status|notif-clear]
# ============================================

set -euo pipefail

DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
ALICE_ID="00000000-0000-0000-0000-000000000001"
BOB_ID="00000000-0000-0000-0000-000000000002"
CHARLIE_ID="00000000-0000-0000-0000-000000000003"

# Get the real user's ID
REAL_USER_ID=$(psql "$DB_URL" -t -A -c "SELECT id FROM users WHERE id NOT IN ('$ALICE_ID','$BOB_ID','$CHARLIE_ID') LIMIT 1" 2>/dev/null || echo "")
REAL_USER=$(psql "$DB_URL" -t -A -c "SELECT github_username FROM users WHERE id = '$REAL_USER_ID'" 2>/dev/null || echo "you")

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }
blue() { printf "\033[36m%s\033[0m\n" "$1"; }
bold() { printf "\033[1m%s\033[0m\n" "$1"; }

run_sql() {
  psql "$DB_URL" -t -A -c "$1" 2>/dev/null
}

resolve_user() {
  local name="$1"
  case "$name" in
    alice)   echo "$ALICE_ID" ;;
    bob)     echo "$BOB_ID" ;;
    charlie) echo "$CHARLIE_ID" ;;
    real|me) echo "$REAL_USER_ID" ;;
    *)       red "Unknown user: '$name'. Use: alice, bob, charlie, real"; exit 1 ;;
  esac
}

cmd_status() {
  bold "=== Friendships ==="
  psql "$DB_URL" -c "
    SELECT
      u1.github_username AS from_user,
      u2.github_username AS to_user,
      f.status,
      f.created_at::date
    FROM friendships f
    JOIN users u1 ON f.requester_id = u1.id
    JOIN users u2 ON f.addressee_id = u2.id
    ORDER BY f.created_at;
  " 2>/dev/null

  bold "=== Friend Codes ==="
  psql "$DB_URL" -c "
    SELECT github_username, friend_code FROM users ORDER BY github_username;
  " 2>/dev/null
}

cmd_reset() {
  blue "Resetting friend test data..."

  # Clear all friendships
  run_sql "DELETE FROM friendships;"

  # Ensure mock users exist (re-insert if needed after db reset)
  run_sql "
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at, instance_id, aud, role)
    VALUES
      ('$ALICE_ID', 'alice@test.com',
       '{\"user_name\": \"alice-dev\", \"avatar_url\": \"https://avatars.githubusercontent.com/u/100000001\", \"full_name\": \"Sarah Chen\"}'::jsonb,
       now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
      ('$BOB_ID', 'bob@test.com',
       '{\"user_name\": \"bob-codes\", \"avatar_url\": \"https://avatars.githubusercontent.com/u/100000002\", \"full_name\": \"Marcus Rivera\"}'::jsonb,
       now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
      ('$CHARLIE_ID', 'charlie@test.com',
       '{\"user_name\": \"charlie-git\", \"avatar_url\": \"https://avatars.githubusercontent.com/u/100000003\", \"full_name\": \"Priya Patel\"}'::jsonb,
       now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;
  "

  # Set known friend codes and identicon avatars
  run_sql "UPDATE users SET friend_code = 'TEST-0001', avatar_url = 'https://avatars.githubusercontent.com/u/100000001' WHERE id = '$ALICE_ID';"
  run_sql "UPDATE users SET friend_code = 'TEST-0002', avatar_url = 'https://avatars.githubusercontent.com/u/100000002' WHERE id = '$BOB_ID';"
  run_sql "UPDATE users SET friend_code = 'TEST-0003', avatar_url = 'https://avatars.githubusercontent.com/u/100000003' WHERE id = '$CHARLIE_ID';"

  green "Done! Mock users: alice-dev (TEST-0001), bob-codes (TEST-0002), charlie-git (TEST-0003)"
}

cmd_send() {
  local from="${1:-charlie}" to="${2:-real}"
  local from_id; from_id=$(resolve_user "$from")
  local to_id; to_id=$(resolve_user "$to")
  local from_username; from_username=$(run_sql "SELECT github_username FROM users WHERE id = '$from_id';")

  blue "Sending friend request: $from -> $to"
  run_sql "
    INSERT INTO friendships (requester_id, addressee_id, status)
    VALUES ('$from_id', '$to_id', 'pending')
    ON CONFLICT (requester_id, addressee_id) DO NOTHING;
  "
  # Also create a notification (like the edge function does)
  run_sql "
    INSERT INTO notification_queue (user_id, type, title, body)
    VALUES ('$to_id', 'friend_request', 'Friend request!', '$from_username wants to be your friend!');
  "
  green "Done! $to now has a pending request from $from (+ notification)"
}

cmd_accept() {
  local from="${1:-}" to="${2:-}"
  if [ -z "$from" ] || [ -z "$to" ]; then
    red "Usage: make friends-accept FROM=alice TO=real"; exit 1
  fi
  local from_id; from_id=$(resolve_user "$from")
  local to_id; to_id=$(resolve_user "$to")

  blue "Accepting friendship: $from -> $to"
  run_sql "UPDATE friendships SET status = 'accepted' WHERE requester_id = '$from_id' AND addressee_id = '$to_id';"
  green "Done!"
}

cmd_reject() {
  local from="${1:-}" to="${2:-}"
  if [ -z "$from" ] || [ -z "$to" ]; then
    red "Usage: make friends-reject FROM=alice TO=real"; exit 1
  fi
  local from_id; from_id=$(resolve_user "$from")
  local to_id; to_id=$(resolve_user "$to")

  blue "Rejecting friendship: $from -> $to"
  run_sql "UPDATE friendships SET status = 'rejected' WHERE requester_id = '$from_id' AND addressee_id = '$to_id';"
  green "Done!"
}

cmd_remove() {
  local user1="${1:-}" user2="${2:-}"
  if [ -z "$user1" ] || [ -z "$user2" ]; then
    red "Usage: make friends-remove FROM=alice TO=real"; exit 1
  fi
  local id1; id1=$(resolve_user "$user1")
  local id2; id2=$(resolve_user "$user2")

  blue "Removing friendship between $user1 and $user2"
  run_sql "DELETE FROM friendships WHERE
    (requester_id = '$id1' AND addressee_id = '$id2') OR
    (requester_id = '$id2' AND addressee_id = '$id1');"
  green "Done!"
}

cmd_notify() {
  local type="${1:-friend_request}" user="${2:-real}"
  local user_id; user_id=$(resolve_user "$user")

  local title body
  case "$type" in
    friend_request)
      title="Friend request!"
      body="alice-dev wants to be your friend!"
      ;;
    goal_reminder)
      title="Keep going!"
      body="You have 2/5 commits today. Keep the streak alive!"
      ;;
    streak_warning)
      title="Streak at risk!"
      body="No commits today yet. Your 7-day streak is in danger!"
      ;;
    badge_earned)
      title="New badge!"
      body="You earned the First Friend badge!"
      ;;
    *)
      red "Unknown type: '$type'. Use: friend_request, goal_reminder, streak_warning, badge_earned"
      exit 1
      ;;
  esac

  blue "Creating $type notification for $user"
  run_sql "
    INSERT INTO notification_queue (user_id, type, title, body)
    VALUES ('$user_id', '$type', '$title', '$body');
  "
  green "Done! $user has a new '$type' notification"
}

cmd_notif_status() {
  bold "=== Notifications ==="
  psql "$DB_URL" -c "
    SELECT
      u.github_username,
      n.type,
      n.title,
      n.read,
      n.created_at::timestamp(0)
    FROM notification_queue n
    JOIN users u ON n.user_id = u.id
    ORDER BY n.created_at DESC
    LIMIT 20;
  " 2>/dev/null
}

cmd_notif_clear() {
  local user="${1:-real}"
  local user_id; user_id=$(resolve_user "$user")

  blue "Clearing all notifications for $user"
  run_sql "DELETE FROM notification_queue WHERE user_id = '$user_id';"
  green "Done!"
}

cmd_help() {
  cat <<EOF
Friend & notification testing script

Usage: ./scripts/test-friends.sh <command> [args]

Commands:
  status                  Show all friendships and friend codes
  reset                   Clear friendships and re-create mock users
  send  <from> <to>       Simulate a friend request (default: charlie -> real)
  accept <from> <to>      Accept a pending request
  reject <from> <to>      Reject a pending request
  remove <user1> <user2>  Remove a friendship
  notify <type> [user]    Create a test notification (default: friend_request for real)
  notif-status            Show all notifications
  notif-clear [user]      Clear all notifications for a user (default: real)

Notification types: friend_request, goal_reminder, streak_warning, badge_earned
Users: alice, bob, charlie, real (your account)

Examples:
  ./scripts/test-friends.sh reset                  # Fresh start
  ./scripts/test-friends.sh send alice real         # Alice sends you a request
  ./scripts/test-friends.sh send bob real           # Bob sends you a request
  ./scripts/test-friends.sh status                  # See all friendships
  ./scripts/test-friends.sh accept alice real       # Accept Alice's request via DB
  ./scripts/test-friends.sh remove alice real       # Remove Alice as friend
  ./scripts/test-friends.sh notify friend_request   # Simulate a friend request notification
  ./scripts/test-friends.sh notify goal_reminder    # Simulate a goal reminder
  ./scripts/test-friends.sh notify streak_warning   # Simulate a streak warning
  ./scripts/test-friends.sh notify badge_earned     # Simulate a badge earned notification
  ./scripts/test-friends.sh notif-status            # See all notifications
  ./scripts/test-friends.sh notif-clear             # Clear your notifications

Tip: Use 'send' to simulate incoming requests, then accept/reject them
     from the Gitty extension UI to test the full flow.
EOF
}

# ── Main ──────────────────────────────────────────────────────────────
case "${1:-help}" in
  status)  cmd_status ;;
  reset)   cmd_reset ;;
  send)    cmd_send "${2:-charlie}" "${3:-real}" ;;
  accept)  cmd_accept "${2:-}" "${3:-}" ;;
  reject)  cmd_reject "${2:-}" "${3:-}" ;;
  remove)  cmd_remove "${2:-}" "${3:-}" ;;
  notify)  cmd_notify "${2:-friend_request}" "${3:-real}" ;;
  notif-status)  cmd_notif_status ;;
  notif-clear)   cmd_notif_clear "${2:-real}" ;;
  help|-h|--help) cmd_help ;;
  *)       red "Unknown command: $1"; cmd_help; exit 1 ;;
esac
