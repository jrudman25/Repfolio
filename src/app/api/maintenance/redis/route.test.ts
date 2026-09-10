import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET } from './route'

const io = vi.hoisted(() => ({ set: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { set = io.set } }))

const secret = 'cron-secret-with-at-least-32-characters'
function request(authorization = `Bearer ${secret}`) {
  return new Request('https://app.example.com/api/maintenance/redis', { headers: { authorization } })
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('CRON_SECRET', secret)
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token')
  io.set.mockResolvedValue('OK')
})
afterEach(() => vi.unstubAllEnvs())

it('performs an environment-scoped expiring write for an authorized cron request', async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toEqual({ status: 'ok' })
  expect(io.set).toHaveBeenCalledWith('repolio:production:maintenance:system:keepalive', 'active', { ex: 691200 })
})
it.each([undefined, '', 'Basic value', 'Bearer wrong-secret', `Bearer ${secret} extra`])('rejects invalid authorization %s without touching Redis', async authorization => {
  const source = authorization === undefined
    ? new Request('https://app.example.com/api/maintenance/redis')
    : request(authorization)
  const response = await GET(source)
  expect(response.status).toBe(401)
  expect(io.set).not.toHaveBeenCalled()
})
it('fails closed for invalid configuration', async () => {
  vi.stubEnv('CRON_SECRET', undefined)
  const response = await GET(request())
  expect(response.status).toBe(503)
  expect(io.set).not.toHaveBeenCalled()
})
it.each([new Error('private-redis-details'), null])('sanitizes Redis failure %#', async result => {
  if (result instanceof Error) io.set.mockRejectedValue(result)
  else io.set.mockResolvedValue(result)
  const response = await GET(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private-redis-details')
})
