import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const io = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), from: vi.fn(), eval: vi.fn(), get: vi.fn(), set: vi.fn(), upsert: vi.fn(), single: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser, getSession: io.getSession }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval; get = io.get; set = io.set } }))
const userId = 'user-a'
const repos = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, name: `repo-${i}`, full_name: `owner/repo-${i}`, description: null,
  html_url: `https://github.com/owner/repo-${i}`, language: null, homepage: null, stargazers_count: 0, pushed_at: null }))
const request = () => new Request('https://app.test/api/sync', { method: 'POST' })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.getSession.mockResolvedValue({ data: { session: { user: { id: userId }, provider_token: 'token' } }, error: null })
  io.eval.mockResolvedValue([1, 60])
  io.get.mockResolvedValue(null)
  io.single.mockResolvedValue({ data: { id: userId }, error: null })
  io.upsert.mockResolvedValue({ error: null })
  io.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: io.single, upsert: io.upsert })
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    const page = Number(new URL(url).searchParams.get('page'))
    return new Response(JSON.stringify(repos.slice((page - 1) * 100, page * 100)))
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('paginates and upserts bounded batches owned by the verified user', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ syncedCount: 205 })
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(io.upsert.mock.calls.map(call => call[0].length)).toEqual([100, 100, 5])
  for (const [batch, options] of io.upsert.mock.calls) {
    expect(batch.every((row: { user_id: string }) => row.user_id === userId)).toBe(true)
    expect(options).toEqual({ onConflict: 'user_id,github_repo_id' })
  }
})
it.each([false, true])('reports only confirmed writes when a later batch fails (throw=%s)', async thrown => {
  io.upsert.mockResolvedValueOnce({ error: null })
  if (thrown) io.upsert.mockRejectedValueOnce(new Error('secret-database'))
  else io.upsert.mockResolvedValueOnce({ error: new Error('secret-database') })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Service temporarily unavailable', syncedCount: 100 })
  expect(io.upsert).toHaveBeenCalledTimes(2)
})
it('checks profile database errors before writes', async () => {
  io.single.mockResolvedValue({ data: { id: userId }, error: new Error('secret') })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Service temporarily unavailable', syncedCount: 0 })
  expect(io.upsert).not.toHaveBeenCalled()
})
it('does not persist any page when a later GitHub page is malformed', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(repos.slice(0, 100))))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'invalid' }])))
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ syncedCount: 0 })
  expect(io.upsert).not.toHaveBeenCalled()
  expect(io.set).not.toHaveBeenCalled()
})
