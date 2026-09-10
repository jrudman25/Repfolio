import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decryptGithubToken, encryptGithubToken } from './github-token-crypto'

beforeEach(() => vi.stubEnv('GITHUB_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64')))
afterEach(() => vi.unstubAllEnvs())

it('round-trips tokens with randomized authenticated encryption', () => {
  const first = encryptGithubToken('user-a', 'github-token')
  const second = encryptGithubToken('user-a', 'github-token')
  expect(first).not.toBe(second)
  expect(decryptGithubToken('user-a', first)).toBe('github-token')
  expect(decryptGithubToken('user-a', second)).toBe('github-token')
})
it('binds ciphertext to its user and rejects tampering', () => {
  const encrypted = encryptGithubToken('user-a', 'github-token')
  expect(() => decryptGithubToken('user-b', encrypted)).toThrow()
  expect(() => decryptGithubToken('user-a', `${encrypted.slice(0, -1)}A`)).toThrow()
})
it.each(['', 'short', Buffer.alloc(31).toString('base64'), Buffer.alloc(32).toString('base64url')])('rejects invalid encryption keys without exposing them', key => {
  vi.stubEnv('GITHUB_TOKEN_ENCRYPTION_KEY', key)
  expect(() => encryptGithubToken('user-a', 'github-token')).toThrow('GITHUB_TOKEN_ENCRYPTION_KEY')
})
