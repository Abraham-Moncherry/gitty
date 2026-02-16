import { useState } from "react"
import { useAuth } from "~contexts/SupabaseAuthContext"
import { supabase } from "~lib/supabase"
import { LogOut, Copy, UserPlus } from "lucide-react"

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const [dailyGoal, setDailyGoal] = useState(user?.daily_goal ?? 5)
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.notifications_enabled ?? true
  )
  const [notificationTime, setNotificationTime] = useState(
    user?.notification_time ?? "20:00:00"
  )
  const [friendCodeInput, setFriendCodeInput] = useState("")
  const [copied, setCopied] = useState(false)

  if (!user) return null

  async function updateSetting(field: string, value: unknown) {
    await supabase.from("users").update({ [field]: value }).eq("id", user!.id)
  }

  async function handleCopyFriendCode() {
    if (user.friend_code) {
      await navigator.clipboard.writeText(user.friend_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleAddFriend() {
    if (!friendCodeInput.trim()) return

    const { data: friend } = await supabase
      .from("users")
      .select("id")
      .eq("friend_code", friendCodeInput.trim().toUpperCase())
      .single()

    if (friend) {
      await supabase.from("friendships").insert({
        requester_id: user.id,
        addressee_id: friend.id,
        status: "pending"
      })
      setFriendCodeInput("")
    }
  }

  const joinDate = new Date(user.created_at).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric"
  })

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* Profile header */}
      <div className="flex items-center gap-3 mb-6">
        {user.avatar_url ? (
          <img src={user.avatar_url} className="w-12 h-12 rounded-full" alt="" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-slate-border" />
        )}
        <div>
          <p className="font-bold text-slate-text">@{user.github_username}</p>
          <p className="text-xs text-slate-light">Joined {joinDate}</p>
        </div>
      </div>

      {/* Daily Goal */}
      <div className="mb-4">
        <label className="text-sm font-medium text-slate-text">
          Daily Goal
        </label>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number"
            min={1}
            max={50}
            value={dailyGoal}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1
              setDailyGoal(val)
              updateSetting("daily_goal", val)
            }}
            className="w-16 px-3 py-2 border border-slate-border rounded-lg text-sm text-center"
          />
          <span className="text-sm text-slate-light">commits/day</span>
        </div>
      </div>

      {/* Notifications toggle */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-slate-text">
          Notifications
        </span>
        <button
          onClick={() => {
            const next = !notificationsEnabled
            setNotificationsEnabled(next)
            updateSetting("notifications_enabled", next)
          }}
          className={`w-11 h-6 rounded-full transition-colors relative ${
            notificationsEnabled ? "bg-primary" : "bg-slate-border"
          }`}>
          <div
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              notificationsEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      {/* Notification time */}
      {notificationsEnabled && (
        <div className="mb-4">
          <label className="text-sm font-medium text-slate-text">
            Remind at
          </label>
          <input
            type="time"
            value={notificationTime.substring(0, 5)}
            onChange={(e) => {
              const val = e.target.value + ":00"
              setNotificationTime(val)
              updateSetting("notification_time", val)
            }}
            className="mt-1 block px-3 py-2 border border-slate-border rounded-lg text-sm"
          />
        </div>
      )}

      {/* Friend Code */}
      <div className="mb-4">
        <label className="text-sm font-medium text-slate-text">
          Friend Code
        </label>
        <div className="flex items-center gap-2 mt-1">
          <span className="px-3 py-2 bg-surface rounded-lg text-sm font-mono text-slate-text">
            {user.friend_code ?? "N/A"}
          </span>
          <button
            onClick={handleCopyFriendCode}
            className="p-2 text-slate-light hover:text-primary transition-colors">
            <Copy size={16} />
          </button>
          {copied && <span className="text-xs text-accent">Copied!</span>}
        </div>
      </div>

      {/* Add Friend */}
      <div className="mb-6">
        <label className="text-sm font-medium text-slate-text">
          Add Friend
        </label>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            placeholder="Enter friend code"
            value={friendCodeInput}
            onChange={(e) => setFriendCodeInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-border rounded-lg text-sm"
          />
          <button
            onClick={handleAddFriend}
            className="p-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition-colors">
            <UserPlus size={16} />
          </button>
        </div>
      </div>

      {/* Sign Out */}
      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 py-3 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
        <LogOut size={16} />
        Sign Out
      </button>
    </div>
  )
}
