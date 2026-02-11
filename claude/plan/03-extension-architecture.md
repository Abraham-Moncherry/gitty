# Extension Architecture

## Plasmo Extension Structure

### Manifest Permissions

Plasmo generates `manifest.json` from `package.json` config. We need:

```json
{
  "permissions": [
    "storage",         // chrome.storage for local caching
    "alarms",          // scheduled sync + notification triggers
    "notifications"    // desktop notifications for daily reminders
  ],
  "host_permissions": [
    "https://api.github.com/*",             // GitHub API
    "https://*.supabase.co/*"               // Supabase API
  ]
}
```

## Background Service Worker

The background script (`src/background/index.ts`) handles:

### 1. Scheduled commit syncing

```
chrome.alarms.create('sync-commits', { periodInMinutes: 30 })

On alarm:
  → Call Supabase Edge Function `sync-commits`
  → Edge Function fetches commits from GitHub API
  → Writes verified data to database
  → Returns updated stats to extension
  → Extension caches results in chrome.storage
```

### 2. Notification scheduling

```
chrome.alarms.create('check-daily-goal', { periodInMinutes: 60 })

On alarm:
  → Check if current time is near user's notification_time
  → Check if user has met daily goal (from cached data)
  → If not met, show chrome.notifications reminder
```

### 3. Auth state management

```
On extension install/startup:
  → Check Supabase session
  → If expired, refresh token
  → If no session, show login screen in popup
```

## Popup UI Pages

The popup is the main user interface. Sized at ~380px wide, ~500px tall.

### Navigation

Bottom tab bar with 4 tabs:

```
┌─────────────────────────────────┐
│                                 │
│         [Page Content]          │
│                                 │
│                                 │
├────────┬────────┬───────┬───────┤
│  Home  │ Board  │ Badge │  Me   │
└────────┴────────┴───────┴───────┘
```

### Page: Home (Dashboard)

```
┌─────────────────────────────────┐
│  🔥 12-day streak              │
│                                 │
│  Today's Commits: 3/5          │
│  ████████░░░░░░░░  (60%)       │
│                                 │
│  This Week                      │
│  M  T  W  T  F  S  S           │
│  ●  ●  ●  ◐  ○  ○  ○          │
│  5  3  7  3  -  -  -           │
│                                 │
│  Total Score: 1,247 pts         │
│  Rank: #42 globally            │
└─────────────────────────────────┘
```

### Page: Leaderboard

```
┌─────────────────────────────────┐
│  [Global]  [Friends]            │
│  [Daily] [Weekly] [Monthly] [∞] │
│                                 │
│  1. 🥇 alice      892 pts      │
│  2. 🥈 bob        756 pts      │
│  3. 🥉 charlie    701 pts      │
│  ...                            │
│  42. → you        523 pts      │
└─────────────────────────────────┘
```

### Page: Badges

```
┌─────────────────────────────────┐
│  Earned (8/16)                  │
│                                 │
│  🎯 First Blood    ✅           │
│  🌱 Getting Started ✅          │
│  ⭐ Half Century    ✅          │
│  💯 Centurion       12/100     │
│  🔥 On Fire         ✅          │
│  ⚡ Unstoppable     5/14       │
│  ...                            │
└─────────────────────────────────┘
```

### Page: Settings (Me)

```
┌─────────────────────────────────┐
│  👤 @username                   │
│  Joined: Jan 2026              │
│                                 │
│  Daily Goal: [5] commits       │
│  Notifications: [ON]           │
│  Remind at: [8:00 PM]          │
│  Timezone: [Auto-detect]       │
│                                 │
│  Friend Code: ABCD-1234        │
│  [Add Friend]                  │
│                                 │
│  [Sign Out]                    │
└─────────────────────────────────┘
```

### Page: Login (shown when not authenticated)

```
┌─────────────────────────────────┐
│                                 │
│         🎮 Gitty                │
│   Gamify your git commits       │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Sign in with GitHub    │    │
│  └─────────────────────────┘    │
│                                 │
└─────────────────────────────────┘
```

## State Management

Use React Context + `chrome.storage` for caching:

```
SupabaseAuthContext
  → Manages session, user object
  → Persists session to chrome.storage.local

StatsContext
  → Today's commits, streak, score
  → Cached in chrome.storage.local
  → Refreshed from Supabase on popup open + alarm sync

LeaderboardContext
  → Fetched from Supabase leaderboard_cache table
  → Cached locally, refreshed every 5 minutes
```

## Data Flow

```
1. User opens popup
   → Load cached stats from chrome.storage
   → Show immediately (fast paint)
   → Fetch fresh data from Supabase in background
   → Update UI when fresh data arrives

2. Background alarm fires (every 30 min)
   → Call sync-commits Edge Function
   → Update chrome.storage cache
   → Update badge on extension icon with today's count

3. User changes settings
   → Update Supabase users table
   → Update chrome.storage cache
```
