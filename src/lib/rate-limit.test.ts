import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { enforceRateLimit } from './rate-limit'
import { apiErrorResponse } from './api-validation'
import { redisKey } from './redis'

const evalIO = vi.hoisted(() => vi.fn())
vi.mock('@upstash/redis', () => ({ Redis: class { eval = evalIO } }))
beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  vi.stubEnv('VERCEL_ENV', 'preview')
  evalIO.mockReset().mockResolvedValue([1, 60])
})
afterEach(() => vi.unstubAllEnvs())
it('allows requests through the limit and returns TTL retry delay afterward', async () => {
  evalIO.mockResolvedValueOnce([20, 12]).mockResolvedValueOnce([21, 11])
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).resolves.toBeUndefined()
  const error = await enforceRateLimit({ userId: 'alice' }, 'chat').catch(e => e)
  const response = apiErrorResponse(error)
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('11')
})
it('isolates users, operations and environments without token-derived keys', async () => {
  await enforceRateLimit({ userId: 'alice' }, 'chat')
  await enforceRateLimit({ userId: 'bob' }, 'chat')
  await enforceRateLimit({ userId: 'alice' }, 'sync')
  vi.stubEnv('VERCEL_ENV', 'production')
  await enforceRateLimit({ userId: 'alice' }, 'chat')
  const keys = evalIO.mock.calls.map(call => call[1][0])
  expect(new Set(keys).size).toBe(4)
  expect(keys[0]).toBe('repolio:preview:rate-limit:alice:chat')
  expect(redisKey({ userId: 'a:b' }, 'cache', 'x/y')).not.toBe(redisKey({ userId: 'a' }, 'cache', 'b:x/y'))
})
it.each([null, [0, 60], [1, -1], ['1', 60], [1]])('fails closed for malformed Redis response %j', async value => {
  evalIO.mockResolvedValue(value)
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).rejects.toMatchObject({ status: 503 })
})
it('fails closed for missing configuration and transport errors', async () => {
  evalIO.mockRejectedValue(new Error('secret'))
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).rejects.toMatchObject({ status: 503, message: 'Service temporarily unavailable' })
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  evalIO.mockClear()
  await expect(enforceRateLimit({ userId: 'alice' }, 'chat')).rejects.toMatchObject({ status: 503 })
  expect(evalIO).not.toHaveBeenCalled()
})
