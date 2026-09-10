import { afterEach, expect, it, vi } from 'vitest'
import config from '../../next.config'

afterEach(() => vi.unstubAllEnvs())

it.each(['production', 'development'])('sets global security headers for %s', async mode => {
  vi.stubEnv('NODE_ENV', mode)
  const rules = await config.headers!()
  expect(rules[0].source).toBe('/:path*')
  const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]))
  expect(headers['X-Frame-Options']).toBe('DENY')
  expect(headers['X-Content-Type-Options']).toBe('nosniff')
  expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'")
  expect(headers['Content-Security-Policy']).toContain("base-uri 'self'")
  expect(headers['Content-Security-Policy']).toContain("object-src 'none'")
  expect(headers['Content-Security-Policy'].includes("'unsafe-eval'")).toBe(mode === 'development')
})
