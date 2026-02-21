import { useStats } from "~contexts/StatsContext"
import { useAuth } from "~contexts/SupabaseAuthContext"
import { Flame, GitCommitHorizontal } from "lucide-react"

const WEEK_DAYS = ["M", "T", "W", "T", "F", "S", "S"]

export function HomePage() {
  const { stats, loading } = useStats()
  const { user } = useAuth()

  if (loading || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-light text-sm">Loading...</p>
      </div>
    )
  }

  const progressPercent =
    stats.dailyGoal > 0
      ? Math.min((stats.todayCommits / stats.dailyGoal) * 100, 100)
      : 0

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* User header + streak */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Flame size={24} className="text-orange-500" />
          <span className="text-2xl font-bold text-slate-text">
            {stats.currentStreak}-day streak
          </span>
        </div>
        {user && (
          <div className="flex flex-col items-center gap-1">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.github_username}
                className="w-7 h-7 rounded-full"
              />
            )}
            <span className="text-[10px] text-slate-light">@{user.github_username}</span>
          </div>
        )}
      </div>

      {/* Current year commits */}
      {user && (
        <div className="flex items-center gap-2 mb-5 bg-surface rounded-xl px-4 py-3">
          <GitCommitHorizontal size={18} className="text-primary" />
          <span className="text-sm text-slate-text">
            <span className="font-bold">{user.total_commits.toLocaleString()}</span>{" "}
            commits in {new Date().getFullYear()}
          </span>
        </div>
      )}

      {/* Today's Progress */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-slate-text">
            Today's Commits
          </span>
          <span className="text-sm text-slate-light">
            {stats.todayCommits}/{stats.dailyGoal}
          </span>
        </div>
        <div className="w-full h-3 bg-slate-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              stats.goalMet ? "bg-accent" : "bg-primary"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Weekly View */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-text mb-3">
          This Week
        </h3>
        <div className="flex justify-between">
          {WEEK_DAYS.map((day, i) => {
            const commitDay = stats.weeklyCommits[i]
            const count = commitDay?.count ?? 0
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-xs text-slate-light">{day}</span>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                    count > 0
                      ? "bg-primary text-white"
                      : "bg-slate-border text-slate-light"
                  }`}>
                  {count > 0 ? count : "-"}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Score + Rank */}
      <div className="flex gap-4">
        <div className="flex-1 bg-surface rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-text">
            {stats.totalScore.toLocaleString()}
          </p>
          <p className="text-xs text-slate-light mt-1">Total Score</p>
        </div>
        <div className="flex-1 bg-surface rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-text">
            {stats.rank ? `#${stats.rank}` : "--"}
          </p>
          <p className="text-xs text-slate-light mt-1">Global Rank</p>
        </div>
      </div>
    </div>
  )
}
