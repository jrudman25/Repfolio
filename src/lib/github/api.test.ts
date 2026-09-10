import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchGithubRepos, fetchGithubReadme, MAX_GITHUB_PAGES } from './api'

const io = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), cache: new Map<string, unknown>() }))
// Mock Upstash Redis
vi.mock('@upstash/redis', () => ({ Redis: class { get = io.get; set = io.set } }))
const identity = { userId: 'user-a', accessToken: 'same-prefix-token-a' }
const repo = (id: number) => ({ id, name: `repo-${id}`, full_name: `owner/repo-${id}`, description: null,
  html_url: `https://github.com/owner/repo-${id}`, language: 'TypeScript', homepage: '', stargazers_count: 0, pushed_at: null })
const page = (start: number, size: number) => Array.from({ length: size }, (_, n) => repo(start + n))
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { Link: '<https://evil.test/private>; rel="next"' } })

describe('GitHub helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    io.cache.clear()
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-token')
    vi.stubEnv('VERCEL_ENV', 'test')
    io.get.mockImplementation(async (key: string) => io.cache.get(key) ?? null)
    io.set.mockImplementation(async (key: string, data: unknown) => { io.cache.set(key, data); return 'OK' })
    // Reset global fetch mock
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('paginates fixed trusted URLs, sends explicit headers and serves validated cache hits', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(page(1, 100))).mockResolvedValueOnce(response(page(101, 1)))
    expect(await fetchGithubRepos(identity)).toHaveLength(101)
    expect(await fetchGithubRepos(identity)).toHaveLength(101)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith('https://api.github.com/user/repos?per_page=100&sort=updated&page=2', expect.objectContaining({
      redirect: 'error', headers: expect.objectContaining({ Authorization: `Bearer ${identity.accessToken}`, 'User-Agent': 'repolio', 'X-GitHub-Api-Version': '2022-11-28' }),
    }))
  })
  it('isolates repo caches by complete token, user and environment with no token fragments', async () => {
    vi.mocked(fetch).mockImplementation(async () => response([repo(1)]))
    await fetchGithubRepos(identity)
    await fetchGithubRepos({ ...identity, accessToken: 'same-prefix-token-b' })
    await fetchGithubRepos({ ...identity, userId: 'user-b' })
    vi.stubEnv('VERCEL_ENV', 'production')
    await fetchGithubRepos(identity)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(new Set(io.cache.keys()).size).toBe(4)
    for (const key of io.cache.keys()) { expect(key).not.toContain('same-prefix'); expect(key).toMatch(/[a-f0-9]{64}$/) }
  })
  it('isolates README caches for users, complete tokens and anonymous authorization', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('private README'))
    for (const context of [identity, { ...identity, userId: 'user-b' }, { ...identity, accessToken: 'same-prefix-token-b' }, { ...identity, accessToken: undefined }]) {
      expect(await fetchGithubReadme('owner', 'repo', context)).toBe('private README')
      expect(await fetchGithubReadme('owner', 'repo', context)).toBe('private README')
    }
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(vi.mocked(fetch).mock.calls[3][1]?.headers).not.toHaveProperty('Authorization')
  })
  it.each([{ id: 1 }, { ...repo(1), stargazers_count: -1 }, { ...repo(1), html_url: 'javascript:secret' }, { ...repo(1), pushed_at: 'invalid' }])('rejects malformed persisted fields', async malformed => {
    vi.mocked(fetch).mockResolvedValue(response([malformed]))
    await expect(fetchGithubRepos(identity)).rejects.toThrow('GitHub service temporarily unavailable')
    expect(io.set).not.toHaveBeenCalled()
  })
  it('validates cache values too', async () => {
    io.get.mockResolvedValue([{ id: 1 }])
    await expect(fetchGithubRepos(identity)).rejects.toThrow('GitHub service temporarily unavailable')
    io.get.mockResolvedValue({ secret: 'not text' })
    await expect(fetchGithubReadme('owner', 'repo', identity)).rejects.toThrow('GitHub service temporarily unavailable')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('fails explicitly at the page bound without caching a truncated result', async () => {
    vi.mocked(fetch).mockImplementation(async () => response(page(1, 100)))
    await expect(fetchGithubRepos(identity)).rejects.toThrow('pagination limit reached')
    expect(fetch).toHaveBeenCalledTimes(MAX_GITHUB_PAGES)
    expect(io.set).not.toHaveBeenCalled()
  })
  it('sanitizes provider and Redis failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('secret-token'))
    await expect(fetchGithubRepos(identity)).rejects.toThrow(/^GitHub service temporarily unavailable$/)
    io.get.mockRejectedValue(new Error('secret-redis'))
    await expect(fetchGithubReadme('owner', 'repo', identity)).rejects.toThrow(/^GitHub service temporarily unavailable$/)
  })
  it('rejects provider HTTP and malformed JSON responses without exposing details', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('secret', { status: 403, statusText: 'secret-token' }))
      .mockResolvedValueOnce(new Response('invalid-json-secret'))
    await expect(fetchGithubRepos(identity)).rejects.toThrow(/^GitHub service temporarily unavailable$/)
    await expect(fetchGithubRepos(identity)).rejects.toThrow(/^GitHub service temporarily unavailable$/)
    expect(io.set).not.toHaveBeenCalled()
  })
  it('sanitizes cache write failures rather than returning unconfirmed cache results', async () => {
    vi.mocked(fetch).mockResolvedValue(response([]))
    io.set.mockRejectedValue(new Error('secret-redis-write'))
    await expect(fetchGithubRepos(identity)).rejects.toThrow(/^GitHub service temporarily unavailable$/)
  })
  it('deduplicates repositories repeated across pages before persistence', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(page(1, 100))).mockResolvedValueOnce(response([repo(100)]))
    expect(await fetchGithubRepos(identity)).toHaveLength(100)
  })
  it('rejects oversized streamed provider responses and cached READMEs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('x'.repeat(2 * 1024 * 1024 + 1)))
      .mockResolvedValueOnce(new Response('x'.repeat(1024 * 1024 + 1)))
    await expect(fetchGithubRepos(identity)).rejects.toThrow('GitHub service temporarily unavailable')
    await expect(fetchGithubReadme('owner', 'repo', identity)).rejects.toThrow('GitHub service temporarily unavailable')
    io.get.mockResolvedValue('x'.repeat(1024 * 1024 + 1))
    await expect(fetchGithubReadme('owner', 'repo', identity)).rejects.toThrow('GitHub service temporarily unavailable')
    expect(io.set).not.toHaveBeenCalled()
  })
  it('returns null for missing READMEs and rejects path traversal before fetching', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }))
    expect(await fetchGithubReadme('owner', 'repo', identity)).toBeNull()
    await expect(fetchGithubReadme('owner', '..', identity)).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
