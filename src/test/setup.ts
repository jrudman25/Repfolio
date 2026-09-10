import '@testing-library/jest-dom'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.com')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
})
afterEach(() => vi.unstubAllEnvs())
