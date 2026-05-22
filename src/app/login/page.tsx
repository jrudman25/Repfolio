'use client'

import { createClient } from '@/utils/supabase/client'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const handleGithubLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // Request additional scopes to access repositories and webhooks
        scopes: 'repo read:user user:email admin:repo_hook'
      },
    })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-zinc-950 text-white">
      <div className="w-full max-w-md p-8 space-y-8 bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">Welcome to Repfolio</h1>
          <p className="mt-2 text-zinc-400">Manage your GitHub portfolio with AI.</p>
        </div>

        <div className="mt-8">
          <Button
            onClick={handleGithubLogin}
            className="w-full flex items-center justify-center gap-2 bg-white text-zinc-950 hover:bg-zinc-200"
            size="lg"
          >
            <GithubIcon className="w-5 h-5" />
            Sign in with GitHub
          </Button>
        </div>
      </div>
    </div>
  )
}
