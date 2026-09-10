import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getCronSecret } from '@/lib/env-server'
import { createRedis, redisKey } from '@/lib/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KEEPALIVE_TTL_SECONDS = 8 * 24 * 60 * 60

function authorized(request: Request, secret: string) {
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1]
  if (!supplied) return false
  const expectedHash = createHash('sha256').update(secret).digest()
  const suppliedHash = createHash('sha256').update(supplied).digest()
  return timingSafeEqual(expectedHash, suppliedHash)
}

export async function GET(request: Request) {
  try {
    const secret = getCronSecret()
    if (!authorized(request, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const result = await createRedis().set(redisKey({ userId: 'system' }, 'maintenance', 'keepalive'), 'active', { ex: KEEPALIVE_TTL_SECONDS })
    if (result !== 'OK') throw new Error('Redis maintenance failed')
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }
}
