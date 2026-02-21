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

  async function fetchUserProfile(userId: string, retries = 3) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single()

    if (data) {
      setUser(data as User)
      setLoading(false)
      return
    }

    // User row might not exist yet (trigger hasn't fired), retry
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1000))
      return fetchUserProfile(userId, retries - 1)
    }

    setLoading(false)
  }

  async function signInWithGitHub() {
    const redirectUrl = chrome.identity.getRedirectURL()

    // Get OAuth URL from Supabase without navigating
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true
      }
    })

    if (error || !data.url) return

    // Open OAuth flow in a Chrome identity popup
    const responseUrl = await new Promise<string | undefined>((resolve) => {
      chrome.identity.launchWebAuthFlow(
        { url: data.url, interactive: true },
        (callbackUrl) => resolve(callbackUrl)
      )
    })

    if (!responseUrl) return

    // Extract tokens from the callback URL hash fragment
    const url = new URL(responseUrl)
    const hashParams = new URLSearchParams(url.hash.substring(1))

    const accessToken = hashParams.get("access_token")
    const refreshToken = hashParams.get("refresh_token")
    const providerToken = hashParams.get("provider_token")

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })

      // Store GitHub provider token in user_metadata so edge functions can access it
      if (providerToken) {
        await supabase.auth.updateUser({
          data: { provider_token: providerToken }
        })
      }
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
        signOut
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
