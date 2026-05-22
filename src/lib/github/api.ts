import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function fetchGithubRepos(accessToken: string) {
  const cacheKey = `github_repos_${accessToken.substring(0, 10)}`
  
  // Try to get from cache first
  const cached = await redis.get(cacheKey)
  if (cached) {
    return cached as unknown[]
  }

  // Fetch from GitHub
  const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch repos: ${res.statusText}`)
  }

  const data = await res.json()
  
  // Cache for 1 hour to prevent rate limiting
  await redis.set(cacheKey, data, { ex: 3600 })
  
  return data
}

export async function fetchGithubReadme(owner: string, repo: string, accessToken?: string) {
  const cacheKey = `github_readme_${owner}_${repo}`
  
  const cached = await redis.get(cacheKey)
  if (cached) {
    return cached as string
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.raw',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
    headers,
  })

  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Failed to fetch readme for ${repo}: ${res.statusText}`)
  }

  const data = await res.text()
  
  // Cache for 24 hours
  await redis.set(cacheKey, data, { ex: 86400 })
  
  return data
}
