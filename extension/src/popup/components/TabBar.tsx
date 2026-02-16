import { Home, Trophy, Award, UserCircle } from "lucide-react"

export type TabId = "home" | "board" | "badge" | "me"

const tabs = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "board" as const, label: "Board", icon: Trophy },
  { id: "badge" as const, label: "Badge", icon: Award },
  { id: "me" as const, label: "Me", icon: UserCircle }
]

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="flex items-center border-t border-slate-border bg-white">
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
              isActive ? "text-primary" : "text-slate-light hover:text-slate"
            }`}>
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
