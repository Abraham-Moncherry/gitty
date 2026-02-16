import { useState } from "react"
import { useAuth } from "~contexts/SupabaseAuthContext"
import { Github } from "lucide-react"

export function LoginPage() {
  const { signInWithGitHub } = useAuth()
  const [signingIn, setSigningIn] = useState(false)

  async function handleSignIn() {
    setSigningIn(true)
    try {
      await signInWithGitHub()
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white px-8">
      <span className="text-5xl mb-3">🎮</span>
      <h1 className="text-3xl font-bold text-slate-text">Gitty</h1>
      <p className="mt-2 text-sm text-slate-light">
        Gamify your git commits
      </p>

      <button
        onClick={handleSignIn}
        disabled={signingIn}
        className="mt-8 flex items-center gap-2 px-6 py-3 bg-slate text-white rounded-lg font-semibold text-sm hover:bg-slate-text transition-colors disabled:opacity-50">
        <Github size={20} />
        {signingIn ? "Signing in..." : "Sign in with GitHub"}
      </button>
    </div>
  )
}
