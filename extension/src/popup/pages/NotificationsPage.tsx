import { useState, useEffect, useCallback } from "react"
import { useAuth } from "~contexts/SupabaseAuthContext"
import { supabase } from "~lib/supabase"
import { Bell, UserPlus, Target, Flame, Award, Check, X, Loader2 } from "lucide-react"

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
}

interface FriendRequest {
  id: string
  requester_id: string
  github_username: string
  avatar_url: string | null
  created_at: string
}

const typeIcons: Record<string, typeof Bell> = {
  friend_request: UserPlus,
  goal_reminder: Target,
  streak_warning: Flame,
  badge_earned: Award
}

const typeColors: Record<string, string> = {
  friend_request: "text-primary",
  goal_reminder: "text-amber-500",
  streak_warning: "text-red-500",
  badge_earned: "text-accent"
}

export function NotificationsPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Fetch notifications and pending friend requests in parallel
    const [notifResult, requestResult] = await Promise.all([
      supabase
        .from("notification_queue")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("friendships")
        .select("id, requester_id, created_at, users!friendships_requester_id_fkey(github_username, avatar_url)")
        .eq("addressee_id", user.id)
        .eq("status", "pending")
    ])

    setNotifications(notifResult.data ?? [])
    setRequests(
      (requestResult.data ?? []).map((r: any) => ({
        id: r.id,
        requester_id: r.requester_id,
        github_username: r.users?.github_username ?? "",
        avatar_url: r.users?.avatar_url ?? null,
        created_at: r.created_at
      }))
    )
    setLoading(false)

    // Mark all unread notifications as read
    const unreadIds = (notifResult.data ?? []).filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length > 0) {
      await supabase
        .from("notification_queue")
        .update({ read: true })
        .in("id", unreadIds)
    }
  }, [user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleAccept(friendshipId: string) {
    const { error } = await supabase.functions.invoke("manage-friends", {
      body: { action: "accept_request", friendship_id: friendshipId }
    })
    if (!error) {
      setRequests((prev) => prev.filter((r) => r.id !== friendshipId))
    }
  }

  async function handleReject(friendshipId: string) {
    const { error } = await supabase.functions.invoke("manage-friends", {
      body: { action: "reject_request", friendship_id: friendshipId }
    })
    if (!error) {
      setRequests((prev) => prev.filter((r) => r.id !== friendshipId))
    }
  }

  function formatTime(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  if (!user) return null

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    )
  }

  const hasContent = requests.length > 0 || notifications.length > 0

  if (!hasContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8">
        <Bell size={32} className="text-slate-border" />
        <p className="text-sm text-slate-light text-center">
          No notifications yet
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* Friend Requests — actionable */}
      {requests.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-bold text-slate-text mb-2">
            Friend Requests
          </h2>
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                {req.avatar_url ? (
                  <img
                    src={req.avatar_url}
                    className="w-9 h-9 rounded-full"
                    alt=""
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-border" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-text truncate">
                    @{req.github_username}
                  </p>
                  <p className="text-[10px] text-slate-light/60">
                    {formatTime(req.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleAccept(req.id)}
                  className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">
                  Accept
                </button>
                <button
                  onClick={() => handleReject(req.id)}
                  className="p-1.5 text-slate-light hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed */}
      {notifications.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-slate-text mb-2">Activity</h2>
          <div className="space-y-2">
            {notifications.map((notif) => {
              const Icon = typeIcons[notif.type] ?? Bell
              const color = typeColors[notif.type] ?? "text-slate-light"
              return (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    notif.read ? "bg-white" : "bg-blue-50"
                  }`}>
                  <div className={`mt-0.5 ${color}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-text">
                      {notif.title}
                    </p>
                    <p className="text-xs text-slate-light mt-0.5">
                      {notif.body}
                    </p>
                    <p className="text-[10px] text-slate-light/60 mt-1">
                      {formatTime(notif.created_at)}
                    </p>
                  </div>
                  {!notif.read && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
