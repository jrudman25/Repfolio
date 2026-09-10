import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { readBodyBytes } from '@/lib/read-body'
import { createClient } from '@supabase/supabase-js'
import { getServerSupabaseEnv, getSupabaseServiceKey, getWebhookSecret } from '@/lib/env-server'

export const runtime = 'nodejs'

// Webhook secret for verification (if configured in GitHub)
function verifySignature(payload: Uint8Array, signature: string | null, secret: string) {
  if (!secret) return false // Skip if not configured
  if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false

  const digest = crypto.createHmac('sha256', secret).update(payload).digest()
  const supplied = Buffer.from(signature.slice(7), 'hex')
  return supplied.length === digest.length && crypto.timingSafeEqual(supplied, digest)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRepository(value: unknown): value is {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  pushed_at: string | null
} {
  if (!isObject(value)) return false
  return Number.isSafeInteger(value.id) && (value.id as number) > 0
    && typeof value.name === 'string' && /^[\w.-]+$/.test(value.name) && value.name !== '.' && value.name !== '..'
    && typeof value.full_name === 'string' && /^[\w-]+\/[\w.-]+$/.test(value.full_name)
    && value.full_name.split('/')[1] === value.name
    && (value.description === null || typeof value.description === 'string')
    && value.html_url === `https://github.com/${value.full_name}`
    && (value.language === null || typeof value.language === 'string')
    && Number.isSafeInteger(value.stargazers_count) && (value.stargazers_count as number) >= 0
    && (value.pushed_at === null || (typeof value.pushed_at === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.pushed_at)
      && Number.isFinite(Date.parse(value.pushed_at))))
}

export async function POST(request: Request) {
  try {
    const secret = getWebhookSecret()

    const signature = request.headers.get('x-hub-signature-256')
    if (!signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    let rawBody: Uint8Array
    try {
      rawBody = await readBodyBytes(request, 2 * 1024 * 1024)
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    const event = request.headers.get('x-github-event')
    if (contentType !== 'application/json' || !event || !['push', 'repository', 'ping'].includes(event)) {
      return NextResponse.json({ error: 'Unsupported webhook' }, { status: 400 })
    }

    let payload: unknown
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody))
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    if (!isObject(payload)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    if (event === 'ping') return NextResponse.json({ received: true })
    if (!isRepository(payload.repository)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const repo = payload.repository

    // Using service role key because webhooks are not authenticated as users
    const { url } = getServerSupabaseEnv()
    const serviceKey = getSupabaseServiceKey()
    const supabase = createClient(
      url,
      serviceKey, // Use service role for webhooks
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    )

    // We need to find if this repo exists in our DB, and who it belongs to
    // Update existing project
    const { error } = await supabase.from('projects').update({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      language: repo.language,
      stargazers_count: repo.stargazers_count,
      pushed_at: repo.pushed_at,
      updated_at: new Date().toISOString()
    }).eq('github_repo_id', repo.id)
    if (error) throw error

    // TODO: We could trigger a new Gemini summary generation if pushed_at changed significantly
    return NextResponse.json({ received: true })
  } catch {
    console.error('Webhook processing failed')
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
