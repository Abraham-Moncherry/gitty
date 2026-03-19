import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react"
import { supabase } from "~lib/supabase"
import { clearAllCache } from "~lib/storage"
import type { Session, User as SupabaseUser } from "@supabase/supabase-js"
import type { User } from "~lib/types"

interface AuthContextValue {
  session: Session | null
  user: User | null
  supabaseUser: SupabaseUser | null
  loading: boolean
  signInWithGitHub: () => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchUserProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchUserProfile(session.user.id)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchUserProfile(userId: string, retries = 8) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single()

    if (data) {
      // Auto-detect timezone on first login (default is 'UTC')
      if (data.timezone === "UTC") {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (detected && detected !== "UTC") {
          await supabase
            .from("users")
            .update({ timezone: detected })
            .eq("id", userId)
          data.timezone = detected
        }
      }
      setUser(data as User)
      setLoading(false)
      return
    }

    // User row might not exist yet (trigger hasn't fired), retry
    // Keep loading=true so the spinner shows instead of "profile not found"
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 500))
      return fetchUserProfile(userId, retries - 1)
    }

    // Only give up after all retries exhausted (4 seconds)
    setLoading(false)
  }

  async function refreshUser() {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s) {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", s.user.id)
        .single()
      if (data) setUser(data as User)
    }
  }

  async function signInWithGitHub() {
    // Delegate OAuth to background service worker so it survives popup close
    setLoading(true)
    const response = await chrome.runtime.sendMessage({ type: "START_OAUTH" })

    if (response?.success) {
      // Background completed OAuth + sync. Reload session from storage.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSession(session)
        await fetchUserProfile(session.user.id)
      }
    } else {
      console.error("[Gitty] OAuth failed:", response?.error)
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    await clearAllCache()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        supabaseUser: session?.user ?? null,
        loading,
        signInWithGitHub,
        signOut,
        refreshUser
      }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
