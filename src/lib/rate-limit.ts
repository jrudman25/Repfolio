import { ApiError } from './api-validation'
import { createRedis, redisKey, type UserContext } from './redis'

export const API_LIMITS = {
  chat: { limit: 20, windowSeconds: 60 },
  sync: { limit: 5, windowSeconds: 300 },
  'process-project': { limit: 10, windowSeconds: 300 },
} as const

const script = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`

export async function enforceRateLimit(context: UserContext, operation: keyof typeof API_LIMITS): Promise<void> {
  const policy = API_LIMITS[operation]
  let result: unknown
  try {
    result = await createRedis().eval(script, [redisKey(context, 'rate-limit', operation)], [policy.windowSeconds])
  } catch {
    throw new ApiError(503, 'Service temporarily unavailable')
  }
  if (!Array.isArray(result) || result.length !== 2 || !Number.isSafeInteger(result[0]) || result[0] < 1
    || !Number.isSafeInteger(result[1]) || result[1] < 0) throw new ApiError(503, 'Service temporarily unavailable')
  if (result[0] > policy.limit) throw new ApiError(429, 'Too many requests', Math.max(1, result[1]))
}
