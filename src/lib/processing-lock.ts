import { randomUUID } from 'node:crypto'
import { ApiError } from './api-validation'
import { createRedis, redisKey, type UserContext } from './redis'

export const PROCESSING_LOCK_TTL_SECONDS = 300

const releaseScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`
const renewScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 0
`

export async function acquireProcessingLock(context: UserContext, projectId: string) {
  try {
    const redis = createRedis()
    const key = redisKey(context, 'processing-lock', projectId)
    const token = randomUUID()
    const acquired = await redis.set(key, token, { nx: true, ex: PROCESSING_LOCK_TTL_SECONDS })
    if (acquired === null) throw new ApiError(409, 'Project processing already in progress', PROCESSING_LOCK_TTL_SECONDS)
    if (acquired !== 'OK') throw new Error('Invalid lock response')
    return {
      async renew() {
        if (await redis.eval(renewScript, [key], [token, PROCESSING_LOCK_TTL_SECONDS]) !== 1) {
          throw new ApiError(503, 'Processing lease expired; retry the request')
        }
      },
      async release() {
        if (await redis.eval(releaseScript, [key], [token]) !== 1) {
          throw new ApiError(503, 'Processing lease expired; retry the request')
        }
      },
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(503, 'Service temporarily unavailable')
  }
}
