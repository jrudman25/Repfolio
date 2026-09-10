import { createClient } from '@supabase/supabase-js'
import { getServerSupabaseEnv, getSupabaseServiceKey } from '@/lib/env-server'

export function createAdminClient() {
  const { url } = getServerSupabaseEnv()
  return createClient(url, getSupabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
