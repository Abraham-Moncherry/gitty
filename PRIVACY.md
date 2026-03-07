# Privacy Policy

**Last updated:** March 7, 2026

Gitty is a browser extension that gamifies your GitHub contributions. This policy explains what data we access, how we use it, and what we don't do.

## What we access

Gitty requests **read-only** access to your GitHub account via OAuth with the `read:user` scope. This is the minimum permission needed to identify your account.

We access the following data from GitHub:

- **Your public profile** — username, display name, and avatar URL
- **Your contribution calendar** — the number of contributions per day (the same green squares visible on your GitHub profile)

## What we do NOT access

- Your repositories or source code
- Commit messages or diffs
- Issues, pull requests, or comments
- Private repository information
- Your email address or personal settings
- Any data from organizations you belong to

## What we store

We store the following in our database (hosted on Supabase):

| Data | Purpose |
|---|---|
| GitHub username and avatar | Display your profile in the app |
| Daily contribution counts | Track streaks, badges, and leaderboards |
| Streak and badge progress | Show your achievements |
| Friends list | Enable friend leaderboards |
| Notification preferences | Send daily goal reminders |

## Authentication tokens

- Your GitHub OAuth token is stored securely in Supabase's encrypted user metadata
- The token is only used server-side (in edge functions) to fetch your contribution calendar
- The token is never logged, shared, or exposed to other users
- The token has **read-only** access — Gitty cannot modify anything on your GitHub account

## Data sharing

We do not sell, share, or transfer your data to third parties. The only external service we communicate with is the GitHub API to fetch your contribution data.

## Leaderboards

If you use the leaderboard feature, the following is visible to other Gitty users:

- Your GitHub username and avatar
- Your total commit count and current streak

## Data deletion

You can remove your account and all associated data at any time. Uninstalling the extension revokes the OAuth token. To request full data deletion, contact us at the email below.

## Contact

If you have questions about this policy, open an issue on our GitHub repository.
