import { useState } from "react"
import { useAuth } from "~contexts/SupabaseAuthContext"
import { Github } from "lucide-react"
import gittyLogo from "url:~assets/Gitty-logo-subtitle.png"
import { GlitchBackdrop } from "~popup/components/GlitchBackdrop"

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
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-white px-8">
      <GlitchBackdrop />
      <img src={gittyLogo} alt="Gitty" className="w-48 relative" />

      <button
        onClick={handleSignIn}
        disabled={signingIn}
        className="relative mt-8 flex items-center gap-2 px-6 py-3 bg-slate text-white rounded-lg font-semibold text-sm hover:bg-slate-text transition-colors disabled:opacity-50">
        <Github size={20} />
        {signingIn ? "Signing in..." : "Sign in with GitHub"}
      </button>
    </div>
  )
}
