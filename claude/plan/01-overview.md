# Gitty - Project Overview

## What is Gitty?
A Chrome extension that gamifies git commits. Track daily commits, maintain streaks, earn badges, compete on leaderboards, and stay motivated — like Duolingo for coding.

## Tech Stack

| Component           | Choice                          |
|---------------------|---------------------------------|
| Extension framework | Plasmo                          |
| UI                  | React + TypeScript + Tailwind   |
| Package manager     | Bun                             |
| Auth                | Supabase GitHub OAuth           |
| Database            | Supabase (Postgres)             |
| Server logic        | Supabase Edge Functions (Deno)  |
| Scheduled jobs      | Supabase pg_cron                |
| Realtime            | Supabase Realtime               |

## Features (v1)

1. **Daily commit tracking** — 1 point per commit
2. **Streaks** — consecutive days with at least 1 commit
3. **Leaderboards** — global and friends
4. **Badges** — milestone achievements (100 commits, 7-day streak, etc.)
5. **Daily goal** — configurable target (default: 5 commits/day)
6. **Notifications** — remind users if they haven't committed today

## Architecture Flow

```
┌──────────────────┐
│ Chrome Extension  │  ← UI, auth, triggers
│  (Plasmo/React)   │
└────────┬─────────┘
         │ Supabase JS client (anon key + JWT)
         ▼
┌──────────────────────────────────┐
│           Supabase               │
│  ┌────────────┐ ┌─────────────┐  │
│  │ Auth       │ │ Database    │  │
│  │ (GitHub    │ │ (Postgres)  │  │
│  │  OAuth)    │ │             │  │
│  └────────────┘ └─────────────┘  │
│  ┌────────────┐ ┌─────────────┐  │
│  │ Edge Funcs │ │ pg_cron     │  │
│  │ (Deno)     │ │ (scheduled  │  │
│  │            │ │  jobs)      │  │
│  └────────────┘ └─────────────┘  │
│  ┌────────────┐ ┌─────────────┐  │
│  │ RLS        │ │ Realtime    │  │
│  │ (security) │ │ (live data) │  │
│  └────────────┘ └─────────────┘  │
└──────────────────────────────────┘
```

## Project Structure

```
gitty/
├── claude/plan/              # This plan
├── extension/                # Plasmo Chrome extension
│   ├── src/
│   │   ├── popup/            # Main popup UI
│   │   │   ├── index.tsx     # Popup entry
│   │   │   ├── pages/        # Popup pages (dashboard, leaderboard, badges, settings)
│   │   │   └── components/   # Shared UI components
│   │   ├── background/       # Service worker
│   │   │   └── index.ts      # Background script (sync triggers, notifications)
│   │   ├── lib/              # Shared utilities
│   │   │   ├── supabase.ts   # Supabase client
│   │   │   ├── github.ts     # GitHub API helpers
│   │   │   └── types.ts      # Shared TypeScript types
│   │   └── styles/           # Tailwind + global styles
│   ├── assets/               # Icons, images
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── supabase/                 # Supabase project
│   ├── migrations/           # Database migrations (SQL)
│   ├── functions/            # Edge Functions
│   │   ├── sync-commits/     # Fetches + verifies commits from GitHub
│   │   ├── calculate-leaderboard/  # Refreshes leaderboard
│   │   └── check-notifications/   # Sends end-of-day reminders
│   └── config.toml           # Supabase local config
└── README.md
```
