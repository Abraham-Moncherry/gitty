import { useEffect, useState } from "react"
import { supabase } from "~lib/supabase"
import { useAuth } from "~contexts/SupabaseAuthContext"
import { useStats } from "~contexts/StatsContext"
import type { Badge } from "~lib/types"
import { Check } from "lucide-react"

interface BadgeWithStatus extends Badge {
  earned: boolean
  earnedAt: string | null
  progress: number
  progressText: string
}

export function BadgesPage() {
  const { user } = useAuth()
  const { stats } = useStats()
  const [badges, setBadges] = useState<BadgeWithStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    async function fetchBadges() {
      const [{ data: allBadges }, { data: earnedBadges }] = await Promise.all([
        supabase
          .from("badges")
          .select("*")
          .order("requirement_value", { ascending: true }),
        supabase
          .from("user_badges")
          .select("badge_id, earned_at")
          .eq("user_id", user!.id)
      ])

      const earnedMap = new Map(
        (earnedBadges ?? []).map((ub) => [ub.badge_id, ub.earned_at])
      )

      const withStatus = (allBadges ?? []).map((badge): BadgeWithStatus => {
        const earned = earnedMap.has(badge.id)
        const earnedAt = earnedMap.get(badge.id) ?? null

        let currentValue = 0
        if (badge.requirement_type === "total_commits") {
          currentValue = stats?.totalScore ?? 0
        } else if (badge.requirement_type === "streak") {
          currentValue = user!.current_streak
        } else if (badge.requirement_type === "daily_commits") {
          currentValue = stats?.todayCommits ?? 0
        }

        const progress = earned
          ? 100
          : Math.min(
              (currentValue / badge.requirement_value) * 100,
              99
            )
        const progressText = earned
          ? "Earned"
          : `${currentValue}/${badge.requirement_value}`

        return {
          ...(badge as Badge),
          earned,
          earnedAt,
          progress,
          progressText
        }
      })

      setBadges(withStatus)
      setLoading(false)
    }

    fetchBadges()
  }, [user, stats])

  const earnedCount = badges.filter((b) => b.earned).length

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <h2 className="text-lg font-bold text-slate-text mb-4">
        Earned ({earnedCount}/{badges.length})
      </h2>

      {loading ? (
        <p className="text-sm text-slate-light text-center py-8">
          Loading...
        </p>
      ) : (
        <div className="space-y-2">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className={`flex items-center gap-3 p-3 rounded-xl ${
                badge.earned ? "bg-surface" : "bg-surface opacity-60"
              }`}>
              <span className="text-2xl w-10 text-center">{badge.icon}</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    badge.earned ? "text-slate-text" : "text-slate-light"
                  }`}>
                  {badge.name}
                </p>
                <p className="text-xs text-slate-light">
                  {badge.description}
                </p>
              </div>
              {badge.earned ? (
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </div>
              ) : (
                <span className="text-xs font-medium text-slate-light">
                  {badge.progressText}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
