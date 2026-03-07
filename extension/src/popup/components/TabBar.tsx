import { Home, Trophy, Award, Bell, UserCircle } from "lucide-react"

export type TabId = "home" | "board" | "badge" | "notif" | "me"

const tabs = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "board" as const, label: "Board", icon: Trophy },
  { id: "badge" as const, label: "Badge", icon: Award },
  { id: "notif" as const, label: "Alerts", icon: Bell },
  { id: "me" as const, label: "Me", icon: UserCircle }
]

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  unreadCount?: number
}

export function TabBar({ activeTab, onTabChange, unreadCount = 0 }: TabBarProps) {
  return (
    <nav className="flex items-center border-t border-slate-border bg-white">
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id
        const showBadge = id === "notif" && unreadCount > 0
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors relative ${
              isActive ? "text-primary" : "text-slate-light hover:text-slate"
            }`}>
            <div className="relative">
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              {showBadge && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            {label}
          </button>
        )
      })}
    </nav>
  )
}
