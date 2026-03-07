import "~styles/globals.css"

import { useState, useEffect, useCallback } from "react"
import { AuthProvider, useAuth } from "~contexts/SupabaseAuthContext"
import { StatsProvider } from "~contexts/StatsContext"
import { LeaderboardProvider } from "~contexts/LeaderboardContext"
import { TabBar, type TabId } from "~popup/components/TabBar"
import { LoginPage } from "~popup/pages/LoginPage"
import { HomePage } from "~popup/pages/HomePage"
import { LeaderboardPage } from "~popup/pages/LeaderboardPage"
import { BadgesPage } from "~popup/pages/BadgesPage"
import { NotificationsPage } from "~popup/pages/NotificationsPage"
import { SettingsPage } from "~popup/pages/SettingsPage"
import { supabase } from "~lib/supabase"

const pages: Record<TabId, () => JSX.Element> = {
  home: HomePage,
  board: LeaderboardPage,
  badge: BadgesPage,
  notif: NotificationsPage,
  me: SettingsPage
}

function PopupContent() {
  const { session, user, loading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>("home")
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return
    const { count } = await supabase
      .from("notification_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false)

    setUnreadCount(count ?? 0)
  }, [user])

  useEffect(() => {
    fetchUnreadCount()
  }, [fetchUnreadCount])

  // When switching to notifications tab, clear the badge after a short delay
  useEffect(() => {
    if (activeTab === "notif" && unreadCount > 0) {
      const timer = setTimeout(() => setUnreadCount(0), 500)
      return () => clearTimeout(timer)
    }
  }, [activeTab, unreadCount])

  if (loading) {
    return (
      <div className="w-[380px] h-[500px] flex items-center justify-center bg-white">
        <p className="text-slate-light text-sm">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="w-[380px] h-[500px]">
        <LoginPage />
      </div>
    )
  }

  // Session exists but user profile failed to load
  if (!user) {
    return (
      <div className="w-[380px] h-[500px] flex flex-col items-center justify-center bg-white gap-3 px-8">
        <p className="text-sm text-slate-light text-center">
          Your profile couldn't be loaded. Try signing out and back in.
        </p>
        <button
          onClick={signOut}
          className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
          Sign Out
        </button>
      </div>
    )
  }

  const ActivePage = pages[activeTab]

  return (
    <div className="w-[380px] h-[500px] flex flex-col bg-white">
      <ActivePage />
      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadCount={unreadCount}
      />
    </div>
  )
}

function Popup() {
  return (
    <AuthProvider>
      <StatsProvider>
        <LeaderboardProvider>
          <PopupContent />
        </LeaderboardProvider>
      </StatsProvider>
    </AuthProvider>
  )
}

export default Popup
