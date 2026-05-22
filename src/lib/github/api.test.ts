import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchGithubRepos } from './api'

// Mock Upstash Redis
vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      get = vi.fn().mockResolvedValue(null)
      set = vi.fn().mockResolvedValue('OK')
    }
  }
})

describe('fetchGithubRepos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset global fetch mock
    global.fetch = vi.fn()
  })

  it('fetches repositories from GitHub API when not cached', async () => {
    const mockRepos = [
      { id: 1, name: 'repo-1', full_name: 'user/repo-1' },
      { id: 2, name: 'repo-2', full_name: 'user/repo-2' }
    ]

      ; (global.fetch as import('vitest').Mock).mockResolvedValue({
        ok: true,
        json: async () => mockRepos
      })

    const result = await fetchGithubRepos('fake-token')

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?per_page=100&sort=updated',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fake-token'
        })
      })
    )

    expect(result).toEqual(mockRepos)
  })

  it('throws an error if GitHub API fails', async () => {
    ; (global.fetch as import('vitest').Mock).mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized'
    })

    await expect(fetchGithubRepos('invalid-token')).rejects.toThrow('Failed to fetch repos: Unauthorized')
  })
})
