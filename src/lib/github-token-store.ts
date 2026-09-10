import { createAdminClient } from '@/utils/supabase/admin'
import { decryptGithubToken, encryptGithubToken } from './github-token-crypto'

export async function storeGithubToken(userId: string, accessToken: string): Promise<void> {
  const { error } = await createAdminClient().from('github_credentials').upsert({
    user_id: userId,
    encrypted_token: encryptGithubToken(userId, accessToken),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw new Error('Unable to store GitHub credential')
}

export async function getStoredGithubToken(userId: string): Promise<string | undefined> {
  const { data, error } = await createAdminClient().from('github_credentials')
    .select('encrypted_token').eq('user_id', userId).maybeSingle()
  if (error) throw new Error('Unable to retrieve GitHub credential')
  if (!data) return undefined
  return decryptGithubToken(userId, data.encrypted_token)
}
