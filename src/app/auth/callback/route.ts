import { NextResponse } from 'next/server'
import { getAppUrl } from '@/lib/env-public'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/utils/supabase/server'

function safeNext(value: string | null) {
  if (!value || !/^\/(?!\/)/.test(value) || /[\\%\u0000-\u0020\u007f-\u009f]/.test(value)) return '/'
  const resolved = new URL(value, 'https://local.invalid')
  if (resolved.origin !== 'https://local.invalid' || resolved.pathname.startsWith('//')) return '/'
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  let origin: string
  try {
    origin = getAppUrl()
  } catch {
    return NextResponse.json({ error: 'Authentication unavailable' }, { status: 503 })
  }
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = safeNext(searchParams.get('next'))

  if (code) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        const redirectOrigin = origin // original origin before load balancer
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${redirectOrigin}${next}`)
      }
    } catch {
      return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
