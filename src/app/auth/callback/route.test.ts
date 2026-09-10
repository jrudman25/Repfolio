import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }) }))
afterEach(() => vi.unstubAllEnvs())

it.each(['//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/%255cevil.test', '/\nevil.test', 'https://evil.test', '/a/..//evil.test'])('rejects unsafe next %s and hostile host', async next => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
  const response = await GET(new Request(`https://evil.test/auth/callback?code=ok&next=${encodeURIComponent(next)}`, { headers: { 'x-forwarded-host': 'evil.test' } }))
  expect(response.headers.get('location')).toBe('https://app.example.com/')
})
it('preserves safe local paths', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
  const response = await GET(new Request('https://evil.test/auth/callback?code=ok&next=%2Fprojects%3Ftab%3Dall'))
  expect(response.headers.get('location')).toBe('https://app.example.com/projects?tab=all')
})
it.each(['', 'http://app.example.com', 'https://user:pass@app.example.com', 'https://app.example.com/path'])('fails closed for invalid production origin %s', async origin => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin)
  expect((await GET(new Request('https://evil.test/auth/callback?code=ok'))).status).toBe(503)
})
