# Gitty - Testing Infrastructure

## Overview

TDD foundation using industry-standard tools: **Vitest** (test runner), **React Testing Library** (component tests), **MSW** (API mocking), **Deno.test** (edge functions), and **pgTAP** (database). ~254 test cases across ~26 files covering all existing code plus TDD specs for unimplemented edge functions.

## Tech Stack

| Tool | Purpose |
|------|---------|
| `vitest` | Test runner — native Bun + TypeScript + ESM support |
| `@testing-library/react` | Component testing with user-centric queries |
| `@testing-library/jest-dom` | Custom DOM matchers (toBeInTheDocument, etc.) |
| `@testing-library/user-event` | Simulating real user interactions |
| `jsdom` | DOM environment for Vitest |
| `msw` | Mock Service Worker for intercepting Supabase API calls |
| `@vitest/coverage-v8` | Code coverage reporting |
| `Deno.test()` | Edge function testing (Deno runtime) |
| `pgTAP` | PostgreSQL trigger and RLS policy testing |

---

## Phase 1: Install Dependencies & Configuration

### 1.1 Install dev dependencies

```bash
cd extension && bun add -d vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw @vitest/coverage-v8
```

### 1.2 Create `extension/vitest.config.ts`

- Path aliases matching tsconfig (`~` → `./src`)
- `environment: "jsdom"` for DOM access
- `globals: true` for describe/it/expect without imports
- `setupFiles: ["./src/__tests__/setup.ts"]`
- `css: false` to skip Tailwind parsing
- `define` block for `process.env.PLASMO_PUBLIC_SUPABASE_URL` and `PLASMO_PUBLIC_SUPABASE_ANON_KEY` test values
- Coverage config with `@vitest/coverage-v8`

### 1.3 Update `extension/package.json` — add scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### 1.4 Update `extension/tsconfig.json` — add vitest types

Add `"types": ["vitest/globals"]` to `compilerOptions`.

---

## Phase 2: Test Setup & Mocks

### 2.1 Create `extension/src/__tests__/setup.ts`

- Import `@testing-library/jest-dom/vitest` for DOM matchers
- Auto-cleanup React components after each test
- Global `chrome` mock covering:
  - `chrome.storage.local` (get/set/remove/clear) — backed by in-memory object
  - `chrome.identity` (getRedirectURL, launchWebAuthFlow)
  - `chrome.alarms` (create, onAlarm.addListener)
  - `chrome.notifications` (create)
  - `chrome.runtime` (onInstalled, onStartup, getURL)
  - `chrome.action` (setBadgeText, setBadgeBackgroundColor)
- Export `resetChromeStorage()` helper

### 2.2 Create `extension/src/__tests__/mocks/supabase.ts`

- Chainable query builder mock (`.from().select().eq().single()`)
- `mockSupabase.auth` (getSession, setSession, signInWithOAuth, signOut, onAuthStateChange, refreshSession)
- `mockSupabase.functions.invoke`
- Helper: `__setTableResponse(table, data, error)` to configure per-test responses
- Helper: `__reset()` to clear all state

### 2.3 Create `extension/src/__tests__/mocks/handlers.ts` + `server.ts`

- MSW handlers for Supabase REST endpoints (optional, for integration-level tests)
- MSW `setupServer()` for Node environment

### 2.4 Create `extension/src/__tests__/fixtures/index.ts`

Factory functions for test data:
- `createMockUser(overrides)` → User object
- `createMockSession(userId)` → Supabase Session
- `createMockStats(overrides)` → CachedStats
- `createMockLeaderboard(overrides)` → CachedLeaderboard

### 2.5 Create `extension/src/__tests__/test-utils.tsx`

- `renderWithProviders(ui, options)` — wraps components in AuthProvider → StatsProvider → LeaderboardProvider with mocked Supabase underneath
- Accepts overridable context values for isolated component testing

---

## Phase 3: Unit Tests

### 3.1 `extension/src/lib/__tests__/storage.test.ts` (~11 cases)

Tests for `extension/src/lib/storage.ts`:

- `getCachedStats` — returns null when empty, returns data when cached, uses correct key `"gitty:stats"`
- `setCachedStats` — writes to chrome.storage with correct key
- `getCachedLeaderboard` — returns null when empty, returns data when cached, uses correct key `"gitty:leaderboard"`
- `setCachedLeaderboard` — writes to chrome.storage with correct key
- `clearAllCache` — removes both keys via `Object.values(KEYS)`

### 3.2 `extension/src/lib/__tests__/supabase.test.ts` (~9 cases)

Tests for `extension/src/lib/supabase.ts`:

- Client created with correct URL and anon key
- Uses chromeStorageAdapter for auth storage
- `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`
- chromeStorageAdapter getItem/setItem/removeItem delegate to chrome.storage.local

---

## Phase 4: Context Integration Tests

### 4.1 `extension/src/contexts/__tests__/StatsContext.test.tsx` (~18 cases)

Tests for `extension/src/contexts/StatsContext.tsx`:

- Initial load: shows loading, loads cache first, then fetches fresh
- `refreshStats`: queries `daily_commits` (today + weekly), `leaderboard_cache` (rank), combines with user profile
- Null handling: no user/session → skip, null data → defaults (0 commits, empty array, null rank)
- Caches results via `setCachedStats`
- `useStats()` throws outside provider

### 4.2 `extension/src/contexts/__tests__/LeaderboardContext.test.tsx` (~19 cases)

Tests for `extension/src/contexts/LeaderboardContext.tsx`:

- Defaults: period="weekly", scope="global", leaderboard=null
- Global scope: queries `leaderboard_cache` with period filter, ordered by rank, limit 50
- Friends scope: first fetches accepted friendships, then filters leaderboard by friend IDs
- Maps results to CachedLeaderboard entry format
- `setPeriod`/`setScope` update state
- Caches via `setCachedLeaderboard`

### 4.3 `extension/src/contexts/__tests__/SupabaseAuthContext.test.tsx` (~25 cases)

Tests for `extension/src/contexts/SupabaseAuthContext.tsx`:

- Session init: calls `getSession` on mount, subscribes to `onAuthStateChange`, unsubscribes on unmount
- `fetchUserProfile`: queries `users` by id, retries 3x with 1s delay if not found
- `signInWithGitHub`: Chrome identity flow → extract tokens from URL hash → `setSession`
- `signOut`: clears session/user state, calls `clearAllCache`
- Auth state change handler updates session and fetches profile

---

## Phase 5: Component Tests

### 5.1 `extension/src/popup/pages/__tests__/LoginPage.test.tsx` (~7 cases)

- Renders app name, tagline, and sign-in button
- Calls `signInWithGitHub` on click
- Shows loading state during sign-in

### 5.2 `extension/src/popup/components/__tests__/TabBar.test.tsx` (~6 cases)

- Renders 4 tabs (Home, Board, Badge, Me) with correct icons
- Highlights active tab, calls `onTabChange` on click

### 5.3 `extension/src/popup/pages/__tests__/HomePage.test.tsx` (~15 cases)

- Loading/null states
- Displays streak, progress bar (capped at 100%), weekly commit grid
- Total score formatted, rank as "#X" or "--"
- Accent color when goal met

### 5.4 `extension/src/popup/pages/__tests__/LeaderboardPage.test.tsx` (~19 cases)

- Scope/period toggle buttons with active highlighting
- Refreshes on mount and when filters change
- Renders entries with medals for top 3, highlights current user with "(you)"

### 5.5 `extension/src/popup/pages/__tests__/BadgesPage.test.tsx` (~14 cases)

- Fetches badges + user_badges on mount
- Progress calculation per requirement_type (total_commits, streak, daily_commits)
- Earned vs unearned styling, capped at 99% for unearned

### 5.6 `extension/src/popup/pages/__tests__/SettingsPage.test.tsx` (~21 cases)

- Profile display (avatar, username, join date)
- Daily goal input (1-50 range, updates Supabase)
- Notifications toggle + time picker visibility
- Friend code copy + "Copied!" feedback
- Add friend flow (lookup by code, insert friendship)
- Sign out button

### 5.7 `extension/src/popup/__tests__/index.test.tsx` (~6 cases)

- Loading state, LoginPage when no session, error state when user is null
- Correct page rendered per active tab, default to "home"

---

## Phase 6: Background Worker Tests

### 6.1 `extension/src/background/__tests__/index.test.ts` (~29 cases)

Tests for `extension/src/background/index.ts`:

- `setupAlarms`: creates sync (30min) and goal-check (60min) alarms
- Event handlers: onInstalled/onStartup → setupAlarms + checkAuthAndSync
- Alarm routing: sync-commits → syncCommits, check-daily-goal → checkDailyGoal
- `syncCommits`: invokes edge function, caches stats, updates badge icon
- `checkDailyGoal`: checks user settings, time window, shows notification if goal unmet, processes notification queue

---

## Phase 7: Edge Function TDD Specs (Deno)

These are written as **failing specs first** — the edge functions don't exist yet. Implementation follows to make them pass.

### 7.1 `supabase/functions/sync-commits/index.test.ts` (~14 cases)

- Auth validation, GitHub event fetching, PushEvent filtering
- Timezone-aware "today", SHA deduplication, repo extraction
- Upsert daily_commits, update streaks, return stats

### 7.2 `supabase/functions/backfill-history/index.test.ts` (~14 cases)

- Skip if already backfilled, GraphQL queries for year + all-time data
- Streak calculation, historical_commits separation, mark complete

### 7.3 `supabase/functions/calculate-leaderboard/index.test.ts` (~7 cases)

- Calculate rankings for all 4 periods using RANK() semantics
- Upsert into leaderboard_cache

---

## Phase 8: Database Tests (pgTAP)

### 8.1 `supabase/tests/triggers.test.sql` (~8 cases)

- `update_updated_at` trigger on users
- `update_goal_met` trigger on daily_commits
- `check_badges_on_commit` trigger awards correct badges
- `handle_new_user` creates user row with friend_code

### 8.2 `supabase/tests/rls.test.sql` (~12 cases)

- Users: public SELECT, self-only UPDATE
- daily_commits: self-only SELECT, no client INSERT/UPDATE
- friendships: self-only SELECT, requester INSERT, addressee UPDATE
- badges/user_badges/leaderboard_cache: public SELECT
- notification_queue: self-only SELECT/UPDATE

---

## Phase 9: CI Pipeline

### Create `.github/workflows/test.yml`

Three parallel jobs:
1. **Extension Tests** — `setup-bun` → `bun install --frozen-lockfile` → `bun test` + coverage
2. **Edge Function Tests** — `setup-deno` → `deno test` per function
3. **Database Tests** — `setup supabase CLI` → `supabase start` → `supabase db test`

Runs on push to `main`/`feature/*` and all PRs to `main`.

---

## Test File Tree

```
extension/src/
├── __tests__/
│   ├── setup.ts                          # Global test setup (Chrome mocks, cleanup)
│   ├── test-utils.tsx                    # renderWithProviders helper
│   ├── mocks/
│   │   ├── supabase.ts                   # Chainable Supabase client mock
│   │   ├── handlers.ts                   # MSW request handlers
│   │   └── server.ts                     # MSW server setup
│   └── fixtures/
│       └── index.ts                      # Test data factories
├── lib/
│   └── __tests__/
│       ├── storage.test.ts               # ~11 cases
│       └── supabase.test.ts              # ~9 cases
├── contexts/
│   └── __tests__/
│       ├── StatsContext.test.tsx          # ~18 cases
│       ├── LeaderboardContext.test.tsx    # ~19 cases
│       └── SupabaseAuthContext.test.tsx   # ~25 cases
├── background/
│   └── __tests__/
│       └── index.test.ts                 # ~29 cases
└── popup/
    ├── __tests__/
    │   └── index.test.tsx                # ~6 cases
    ├── components/
    │   └── __tests__/
    │       └── TabBar.test.tsx           # ~6 cases
    └── pages/
        └── __tests__/
            ├── HomePage.test.tsx          # ~15 cases
            ├── LeaderboardPage.test.tsx   # ~19 cases
            ├── BadgesPage.test.tsx        # ~14 cases
            ├── SettingsPage.test.tsx      # ~21 cases
            └── LoginPage.test.tsx         # ~7 cases

supabase/
├── functions/
│   ├── sync-commits/index.test.ts        # ~14 cases (Deno)
│   ├── backfill-history/index.test.ts    # ~14 cases (Deno)
│   └── calculate-leaderboard/index.test.ts # ~7 cases (Deno)
└── tests/
    ├── triggers.test.sql                 # ~8 cases (pgTAP)
    └── rls.test.sql                      # ~12 cases (pgTAP)
```

---

## File Summary

| Category | Files to Create | Test Cases |
|----------|----------------|------------|
| Config | `vitest.config.ts`, updated `package.json`, updated `tsconfig.json` | — |
| Setup/Mocks | `setup.ts`, `mocks/supabase.ts`, `mocks/handlers.ts`, `mocks/server.ts`, `fixtures/index.ts`, `test-utils.tsx` | — |
| Unit | `storage.test.ts`, `supabase.test.ts` | ~20 |
| Contexts | `StatsContext.test.tsx`, `LeaderboardContext.test.tsx`, `SupabaseAuthContext.test.tsx` | ~62 |
| Components | `LoginPage.test.tsx`, `TabBar.test.tsx`, `HomePage.test.tsx`, `LeaderboardPage.test.tsx`, `BadgesPage.test.tsx`, `SettingsPage.test.tsx`, `popup/index.test.tsx` | ~88 |
| Background | `background/index.test.ts` | ~29 |
| Edge Functions | `sync-commits/index.test.ts`, `backfill-history/index.test.ts`, `calculate-leaderboard/index.test.ts` | ~35 |
| Database | `triggers.test.sql`, `rls.test.sql` | ~20 |
| CI | `.github/workflows/test.yml` | — |
| **Total** | **~26 files** | **~254 cases** |

---

## Verification

After implementation, verify end-to-end:

1. `cd extension && bun test` — all unit/integration/component tests pass
2. `cd extension && bun run test:coverage` — coverage report generates
3. `deno test supabase/functions/*/index.test.ts` — edge function specs run (will fail until functions are implemented, expected for TDD)
4. `supabase start && supabase db test` — pgTAP trigger and RLS tests pass
5. `bun run build` — production build still succeeds (no test config interference)

## Implementation Order

1. Phase 1-2 first (config + mocks) — foundational, everything depends on this
2. Phase 3 (unit tests for storage) — simplest, validates the entire mock setup works
3. Phase 4 (context tests) — validates Supabase mock strategy
4. Phase 5 (component tests) — validates render utility and provider wrapping
5. Phase 6 (background worker) — most complex mock setup
6. Phase 7-8 (edge functions + database) — independent from extension tests
7. Phase 9 (CI) — last, once all tests pass locally
