<p align="center">
  <img src="extension/assets/Gitty-logo.png" alt="Gitty" width="300" />
</p>

<p align="center">
  A Chrome extension that gamifies git commits. Track daily commits, maintain streaks, earn badges, and compete on leaderboards — like Duolingo for coding.
</p>

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
- [Docker](https://www.docker.com/) (required by Supabase CLI)
- Chrome browser

### First-time setup

```bash
git clone <repo-url>
cd gitty
make setup
```

This installs dependencies, starts the local Supabase stack, and applies all database migrations.

### Start developing

```bash
make dev
```

This starts everything in one command:
- Supabase (API on `:54321`, DB on `:54322`, Studio on `:54323`)
- Edge functions with hot reload
- Plasmo extension dev server

Then load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/build/chrome-mv3-dev`

### GitHub OAuth setup (one-time)

The extension uses GitHub OAuth via Supabase. After loading the extension in Chrome for the first time:

1. Copy the extension ID from `chrome://extensions` (e.g., `abcdef1234567890...`)
2. Go to your [GitHub OAuth App](https://github.com/settings/developers) settings
3. Set the callback URL to `https://<your-extension-id>.chromiumapp.org/`
4. Update the same URL in `supabase/config.toml` under `[auth.external.github]`

This only needs to be done once — the ID stays the same as long as you load from the same folder.

### Environment

Env files are pre-configured for local development:
- `extension/.env.development` — Supabase URL + anon key (used by `plasmo dev`)
- `extension/.env.production` — production values (used by `plasmo build`)
- `supabase/.env` — GitHub OAuth credentials

To get your local keys: `make db-status`

## Make Commands

Run `make help` to see all available commands.

| Command | Description |
|---|---|
| **Development** | |
| `make setup` | First-time setup: install deps + start Supabase |
| `make dev` | Start Supabase + edge functions + extension dev server |
| `make stop` | Stop all services |
| **Extension** | |
| `make ext-dev` | Start extension dev server only |
| `make ext-build` | Production build |
| `make ext-test` | Run unit tests (Vitest) |
| `make ext-test-watch` | Run tests in watch mode |
| `make ext-test-coverage` | Run tests with coverage report |
| **Database** | |
| `make db-start` | Start local Supabase |
| `make db-stop` | Stop local Supabase |
| `make db-reset` | Drop all tables + re-run migrations |
| `make db-status` | Show service URLs and keys |
| `make db-studio` | Open Supabase Studio in browser |
| `make db-migrate name=foo` | Create a new migration file |
| **Edge Functions** | |
| `make fn-serve` | Serve edge functions locally (hot reload) |
| `make fn-deploy` | Deploy all edge functions to production |
| `make logs` | Tail edge function logs |
| **Manual Testing** | |
| `make sync JWT=<token>` | Trigger sync-commits |
| `make backfill JWT=<token>` | Trigger backfill-history |
| `make leaderboard` | Trigger calculate-leaderboard |
| **Utilities** | |
| `make test` | Run all tests |
| `make clean` | Remove build artifacts |
