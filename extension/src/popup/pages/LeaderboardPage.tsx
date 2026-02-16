import { useEffect } from "react"
import { useLeaderboard, type Period, type Scope } from "~contexts/LeaderboardContext"
import { useAuth } from "~contexts/SupabaseAuthContext"

const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "all_time", label: "All" }
]

const SCOPES: { id: Scope; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "friends", label: "Friends" }
]

const MEDALS = ["🥇", "🥈", "🥉"]

export function LeaderboardPage() {
  const {
    leaderboard,
    loading,
    period,
    scope,
    setPeriod,
    setScope,
    refreshLeaderboard
  } = useLeaderboard()
  const { user } = useAuth()

  useEffect(() => {
    refreshLeaderboard()
  }, [period, scope, refreshLeaderboard])

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* Scope toggle */}
      <div className="flex gap-2 mb-3">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              scope === s.id
                ? "bg-primary text-white"
                : "bg-slate-border text-slate-light"
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Period filters */}
      <div className="flex gap-2 mb-4">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              period === p.id
                ? "bg-slate-text text-white"
                : "text-slate-light hover:text-slate"
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center text-sm text-slate-light py-8">
          Loading...
        </p>
      ) : !leaderboard?.entries.length ? (
        <p className="text-center text-sm text-slate-light py-8">
          No entries yet
        </p>
      ) : (
        <div className="space-y-2">
          {leaderboard.entries.map((entry) => {
            const isMe = entry.userId === user?.id
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  isMe
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-surface"
                }`}>
                <span className="w-8 text-center text-sm font-bold text-slate-light">
                  {entry.rank <= 3 ? MEDALS[entry.rank - 1] : `${entry.rank}.`}
                </span>
                {entry.avatarUrl ? (
                  <img
                    src={entry.avatarUrl}
                    className="w-8 h-8 rounded-full"
                    alt=""
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-border" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-text truncate">
                    {entry.displayName || entry.githubUsername}
                    {isMe && (
                      <span className="text-primary ml-1">(you)</span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-text">
                  {entry.score.toLocaleString()} pts
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
