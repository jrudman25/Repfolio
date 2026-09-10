import { getAppUrl, getPublicSupabaseEnv } from './env-public'
import { originEnv, requiredEnv } from './env-validation'

function assertServer() {
  if (typeof window !== 'undefined') throw new Error('Server environment is unavailable in the browser')
}

assertServer()

export function getGeminiApiKey() {
  assertServer()
  return requiredEnv('GEMINI_API_KEY', process.env.GEMINI_API_KEY)
}

export function getRedisEnv() {
  assertServer()
  return {
    url: originEnv('UPSTASH_REDIS_REST_URL', process.env.UPSTASH_REDIS_REST_URL),
    token: requiredEnv('UPSTASH_REDIS_REST_TOKEN', process.env.UPSTASH_REDIS_REST_TOKEN),
  }
}

export function getWebhookSecret() {
  assertServer()
  return requiredEnv('GITHUB_WEBHOOK_SECRET', process.env.GITHUB_WEBHOOK_SECRET)
}

export function getSupabaseServiceKey() {
  assertServer()
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function getDeploymentEnvironment() {
  assertServer()
  const nodeEnv = requiredEnv('NODE_ENV', process.env.NODE_ENV)
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid environment variable: NODE_ENV')
  return process.env.VERCEL_ENV === undefined ? nodeEnv : requiredEnv('VERCEL_ENV', process.env.VERCEL_ENV)
}

export function validateServerEnv() {
  assertServer()
  const errors: string[] = []
  const checks = [
    getDeploymentEnvironment,
    getAppUrl,
    () => originEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NODE_ENV !== 'production'),
    () => requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    getSupabaseServiceKey,
    getWebhookSecret,
    getGeminiApiKey,
    () => originEnv('UPSTASH_REDIS_REST_URL', process.env.UPSTASH_REDIS_REST_URL),
    () => requiredEnv('UPSTASH_REDIS_REST_TOKEN', process.env.UPSTASH_REDIS_REST_TOKEN),
  ]
  for (const check of checks) {
    try { check() } catch (error) { errors.push((error as Error).message) }
  }
  if (errors.length) throw new Error(errors.join('; '))
}

export function getServerSupabaseEnv() {
  assertServer()
  return getPublicSupabaseEnv()
}
