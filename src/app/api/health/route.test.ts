import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { middleware } from '@/middleware'

afterEach(() => vi.unstubAllEnvs())

it('returns uncached liveness without credentials, dependencies, or redirects', async () => {
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'GITHUB_WEBHOOK_SECRET']) {
    vi.stubEnv(name, undefined)
  }
  const response = GET()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('location')).toBeNull()
  expect(await response.json()).toEqual({ status: 'ok' })
  const result = await middleware(new NextRequest('https://app.example.com/api/health'))
  expect(result.headers.get('location')).toBeNull()
  expect(result.headers.get('x-middleware-next')).toBe('1')
})
