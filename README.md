# Gitty

A Chrome extension that gamifies git commits. Track daily commits, maintain streaks, earn badges, and compete on leaderboards — like Duolingo for coding.

## Features

- **Daily commit tracking** — 1 point per commit
- **Streaks** — consecutive days with at least 1 commit
- **Badges** — milestone achievements (100 commits, 7-day streak, etc.)
- **Leaderboards** — global and friends rankings
- **Daily goal** — configurable target (default: 5 commits/day)
- **Notifications** — reminders if you haven't committed today

## Tech Stack

| Component | Choice |
|---|---|
| Extension framework | [Plasmo](https://www.plasmo.com/) |
| UI | React + TypeScript + Tailwind |
| Package manager | Bun |
| Auth | Supabase GitHub OAuth |
| Database | Supabase (Postgres) |
| Server logic | Supabase Edge Functions (Deno) |

## Project Structure

```
gitty/
├── extension/               # Chrome extension (Plasmo)
│   ├── src/
│   │   ├── popup/           # Popup UI (pages + components)
│   │   ├── background/      # Service worker (sync, notifications)
│   │   ├── contexts/        # React contexts (Auth, Stats, Leaderboard)
│   │   ├── lib/             # Supabase client, types, storage helpers
│   │   └── styles/          # Tailwind + global styles
│   ├── assets/              # Extension icon
│   └── package.json
├── supabase/                # Backend
│   ├── migrations/          # Database schema + RLS policies
│   ├── functions/           # Edge Functions
│   └── config.toml          # Local Supabase config
└── claude/plan/             # Design docs
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (package manager)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Chrome browser

### 1. Clone and install

```bash
git clone <repo-url>
cd gitty/extension
bun install
```

### 2. Start Supabase locally

```bash
cd supabase
supabase start
```

This starts the local Supabase stack (API on `:54321`, DB on `:54322`, Studio on `:54323`).

### 3. Configure environment

Copy the example env file and fill in your local Supabase keys:

```bash
cd extension
cp .env.example .env.development
```

Get your local keys from `supabase status`:

```
PLASMO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PLASMO_PUBLIC_SUPABASE_ANON_KEY=<publishable key from supabase status>
```

Plasmo loads environment files by mode:
- `plasmo dev` reads `.env.development`
- `plasmo build` reads `.env.production`

### 4. Run the extension

```bash
cd extension
bun run dev
```

Then load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/build/chrome-mv3-dev`

### Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server with hot reload |
| `bun run build` | Production build |
| `bun run package` | Package for Chrome Web Store |
