import { Redis } from '@upstash/redis'
import { getDeploymentEnvironment, getRedisEnv } from '@/lib/env-server'

export type UserContext = { userId: string }

export function redisKey(context: UserContext, purpose: string, ...parts: string[]): string {
  const environment = getDeploymentEnvironment()
  if (!environment || !context.userId || !purpose) throw new Error('Invalid Redis context')
  return ['repolio', environment, purpose, context.userId, ...parts].map(encodeURIComponent).join(':')
}

export function createRedis(): Redis {
  const { url, token } = getRedisEnv()
  return new Redis({ url, token, retry: false, signal: () => AbortSignal.timeout(15_000) })
}
