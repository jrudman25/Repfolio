import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { acquireProcessingLock, PROCESSING_LOCK_TTL_SECONDS } from './processing-lock'

const io = vi.hoisted(() => ({ set: vi.fn(), eval: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { set = io.set; eval = io.eval } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
  io.set.mockResolvedValue('OK')
  io.eval.mockResolvedValue(1)
})
afterEach(() => vi.unstubAllEnvs())
it('uses tenant/project scoped NX leases with TTL and unique owner tokens', async () => {
  await acquireProcessingLock({ userId: 'alice' }, 'project')
  await acquireProcessingLock({ userId: 'bob' }, 'project')
  await acquireProcessingLock({ userId: 'alice' }, 'other')
  await acquireProcessingLock({ userId: 'alice' }, 'project')
  const calls = io.set.mock.calls
  expect(new Set(calls.map(call => call[0])).size).toBe(3)
  expect(new Set(calls.map(call => call[1])).size).toBe(4)
  expect(calls[0][2]).toEqual({ nx: true, ex: PROCESSING_LOCK_TTL_SECONDS })
})
it('releases and renews atomically using the acquiring owner token', async () => {
  const lock = await acquireProcessingLock({ userId: 'alice' }, 'project')
  const [key, token] = io.set.mock.calls[0]
  await lock.renew()
  await lock.release()
  expect(io.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('GET', KEYS[1]) == ARGV[1]"), [key], [token, PROCESSING_LOCK_TTL_SECONDS])
  expect(io.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('GET', KEYS[1]) == ARGV[1]"), [key], [token])
})
it('reports lost leases instead of deleting a successor lease', async () => {
  const lock = await acquireProcessingLock({ userId: 'alice' }, 'project')
  io.eval.mockResolvedValue(0)
  await expect(lock.release()).rejects.toThrow('Processing lease expired')
  await expect(lock.renew()).rejects.toThrow('Processing lease expired')
})
it('surfaces Redis release errors', async () => {
  const lock = await acquireProcessingLock({ userId: 'alice' }, 'project')
  io.eval.mockRejectedValue(new Error('Redis unavailable'))
  await expect(lock.release()).rejects.toThrow('Redis unavailable')
})
