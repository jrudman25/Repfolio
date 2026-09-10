import { originEnv, requiredEnv } from './env-validation'

export function getPublicSupabaseEnv() {
  return {
    url: originEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NODE_ENV !== 'production'),
    anonKey: requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  }
}

export function getAppUrl() {
  return originEnv('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV !== 'production')
}
