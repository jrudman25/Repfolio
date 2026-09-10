import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decryptGithubToken, encryptGithubToken } from './github-token-crypto'
import { getStoredGithubToken, storeGithubToken } from './github-token-store'

const io = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ from: io.from }) }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GITHUB_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'))
  const query = { upsert: io.upsert, select: io.select, eq: io.eq, maybeSingle: io.maybeSingle }
  io.from.mockReturnValue(query)
  io.select.mockReturnValue(query)
  io.eq.mockReturnValue(query)
  io.upsert.mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

it('stores only user-bound ciphertext through the service client', async () => {
  await storeGithubToken('user-a', 'github-token')
  expect(io.from).toHaveBeenCalledWith('github_credentials')
  const [row, options] = io.upsert.mock.calls[0]
  expect(row.encrypted_token).not.toContain('github-token')
  expect(decryptGithubToken('user-a', row.encrypted_token)).toBe('github-token')
  expect(options).toEqual({ onConflict: 'user_id' })
})
it('retrieves and decrypts a stored token for the same user', async () => {
  io.maybeSingle.mockResolvedValue({ data: { encrypted_token: encryptGithubToken('user-a', 'github-token') }, error: null })
  await expect(getStoredGithubToken('user-a')).resolves.toBe('github-token')
  expect(io.eq).toHaveBeenCalledWith('user_id', 'user-a')
})
it('returns no token when no credential exists', async () => {
  io.maybeSingle.mockResolvedValue({ data: null, error: null })
  await expect(getStoredGithubToken('user-a')).resolves.toBeUndefined()
})
it.each(['store', 'retrieve'])('sanitizes %s database failures', async operation => {
  if (operation === 'store') {
    io.upsert.mockResolvedValue({ error: new Error('database-secret') })
    await expect(storeGithubToken('user-a', 'github-token')).rejects.toThrow('Unable to store GitHub credential')
  } else {
    io.maybeSingle.mockResolvedValue({ data: null, error: new Error('database-secret') })
    await expect(getStoredGithubToken('user-a')).rejects.toThrow('Unable to retrieve GitHub credential')
  }
})
