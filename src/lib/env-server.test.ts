import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGeminiApiKey, getRedisEnv, validateServerEnv } from './env-server'
import { getAppUrl, getPublicSupabaseEnv } from './env-public'
import { register } from '../instrumentation'

const valid = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_URL: 'https://app.example.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-role',
  GITHUB_WEBHOOK_SECRET: 'dummy-webhook',
  GEMINI_API_KEY: 'dummy-gemini',
  UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'dummy-redis',
}

beforeEach(() => {
  for (const [name, value] of Object.entries(valid)) vi.stubEnv(name, value)
  vi.stubEnv('VERCEL_ENV', undefined)
  vi.stubEnv('NEXT_PHASE', undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('server startup configuration', () => {
  it('accepts valid production configuration without network access', async () => {
    expect(validateServerEnv()).toBeUndefined()
    await expect(register()).resolves.toBeUndefined()
    expect(getPublicSupabaseEnv()).toEqual({ url: valid.NEXT_PUBLIC_SUPABASE_URL, anonKey: valid.NEXT_PUBLIC_SUPABASE_ANON_KEY })
    expect(getRedisEnv()).toEqual({ url: valid.UPSTASH_REDIS_REST_URL, token: valid.UPSTASH_REDIS_REST_TOKEN })
  })
  it.each(Object.keys(valid))('fails startup when %s is missing or blank', async name => {
    for (const value of [undefined, '', '   ']) {
      vi.stubEnv(name, value)
      expect(validateServerEnv).toThrow(name)
      await expect(register()).rejects.toThrow(name)
    }
  })
  it('reports all invalid names without values', () => {
    for (const name of Object.keys(valid)) vi.stubEnv(name, '')
    let message = ''
    try { validateServerEnv() } catch (error) { message = (error as Error).message }
    for (const name of Object.keys(valid)) expect(message).toContain(name)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://private-user:private-password@private-host.test')
    expect(validateServerEnv).not.toThrow(/private-user|private-password|private-host/)
  })
  it.each(['http://app.example.com', 'javascript:alert(1)', 'https://user:pass@app.test', 'https://app.test/path', 'https://app.test?token=secret', 'https://app.test#secret', 'https://app.test\\evil', 'https://app.test\n'])('rejects unsafe production APP URL %s', value => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', value)
    expect(validateServerEnv).toThrow('NEXT_PUBLIC_APP_URL')
  })
  it('permits local HTTP only outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    expect(validateServerEnv()).toBeUndefined()
    expect(getAppUrl()).toBe('http://localhost:3000')
    vi.stubEnv('NODE_ENV', 'production')
    expect(validateServerEnv).toThrow('NEXT_PUBLIC_APP_URL')
  })
  it.each(['http://redis.test', 'https://redis.test/path', 'https://user:pass@redis.test'])('requires a secure Redis origin %s', value => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', value)
    expect(validateServerEnv).toThrow('UPSTASH_REDIS_REST_URL')
  })
  it('skips aggregate validation only in the production build phase', async () => {
    vi.stubEnv('GEMINI_API_KEY', undefined)
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    await expect(register()).resolves.toBeUndefined()
    vi.stubEnv('NEXT_PHASE', 'phase-production-server')
    await expect(register()).rejects.toThrow('GEMINI_API_KEY')
  })
  it('blocks server configuration access in browsers without exposing values', () => {
    vi.stubGlobal('window', {})
    expect(getGeminiApiKey).toThrow('Server environment is unavailable in the browser')
    expect(validateServerEnv).toThrow('Server environment is unavailable in the browser')
  })
})
