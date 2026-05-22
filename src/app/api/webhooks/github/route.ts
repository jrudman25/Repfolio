import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Webhook secret for verification (if configured in GitHub)
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET

function verifySignature(payload: string, signature: string | null) {
  if (!WEBHOOK_SECRET) return true // Skip if not configured
  if (!signature) return false

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
  const digest = `sha256=${hmac.update(payload).digest('hex')}`
  
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256')
    
    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = request.headers.get('x-github-event')
    const payload = JSON.parse(rawBody)

    // Using service role key because webhooks are not authenticated as users
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role for webhooks
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        }
      }
    )

    if (event === 'push' || event === 'repository') {
      const repo = payload.repository
      
      // We need to find if this repo exists in our DB, and who it belongs to
      const { data: project } = await supabase
        .from('projects')
        .select('id, user_id')
        .eq('github_repo_id', repo.id)
        .single()

      if (project) {
        // Update existing project
        await supabase.from('projects').update({
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          html_url: repo.html_url,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          pushed_at: repo.pushed_at,
          updated_at: new Date().toISOString()
        }).eq('id', project.id)
        
        // TODO: We could trigger a new Gemini summary generation if pushed_at changed significantly
      }
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
