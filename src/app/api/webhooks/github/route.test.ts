import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const secret = 'test-webhook-secret'
const repository = {
  id: 42,
  name: 'updated',
  full_name: 'owner/updated',
  description: null,
  html_url: 'https://github.com/owner/updated',
  language: 'TypeScript',
  stargazers_count: 7,
  pushed_at: '2026-05-21T12:00:00Z',
}

function delivery(body = JSON.stringify({ repository }), headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'push',
      'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`,
      ...headers,
    },
    body,
  })
}

let network: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', secret)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.example.com')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key')
  network = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', network)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('GitHub webhook authentication', () => {
  it.each([undefined, '', '   '])('fails closed when the secret is %s', async value => {
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', value)
    const response = await POST(delivery())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Webhook processing failed' })
    expect(network).not.toHaveBeenCalled()
  })

  it.each(['', 'sha256=abc', `sha256=${'a'.repeat(64)}`, `sha256=${'g'.repeat(64)}`, `sha1=${'a'.repeat(40)}`, `sha256=${'a'.repeat(128)}`])('rejects invalid signature %s', async signature => {
    const response = await POST(delivery(undefined, { 'x-hub-signature-256': signature }))
    expect(response.status).toBe(401)
    expect(network).not.toHaveBeenCalled()
  })

  it('rejects an absent signature', async () => {
    const request = delivery()
    request.headers.delete('x-hub-signature-256')
    expect((await POST(request)).status).toBe(401)
    expect(network).not.toHaveBeenCalled()
  })

  it('authenticates exact bytes rather than parsed JSON', async () => {
    const original = delivery()
    const changed = delivery(JSON.stringify({ repository }, null, 2), {
      'x-hub-signature-256': original.headers.get('x-hub-signature-256')!,
    })
    expect((await POST(changed)).status).toBe(401)
    expect(network).not.toHaveBeenCalled()
  })
})

describe('GitHub webhook validation', () => {
  it('rejects oversized bodies with a lying content length before database access', async () => {
    expect((await POST(delivery('x'.repeat(2 * 1024 * 1024 + 1), { 'content-length': '1' }))).status).toBe(400)
    expect(network).not.toHaveBeenCalled()
  })
  it('does not consume the body without a signature', async () => {
    const request = delivery()
    request.headers.delete('x-hub-signature-256')
    expect((await POST(request)).status).toBe(401)
    expect(request.bodyUsed).toBe(false)
  })
  it('rejects signed invalid UTF-8', async () => {
    const body = new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125])
    const request = new Request('https://app.test/api/webhooks/github', { method: 'POST', body,
      headers: { 'content-type': 'application/json', 'x-github-event': 'ping',
        'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}` } })
    expect((await POST(request)).status).toBe(400)
    expect(network).not.toHaveBeenCalled()
  })
  it.each(['text/plain', 'application/x-www-form-urlencoded', ''])('rejects content type %s', async contentType => {
    expect((await POST(delivery(undefined, { 'content-type': contentType }))).status).toBe(400)
    expect(network).not.toHaveBeenCalled()
  })

  it.each(['issues', '', 'Push'])('rejects unsupported event %s', async event => {
    expect((await POST(delivery(undefined, { 'x-github-event': event }))).status).toBe(400)
    expect(network).not.toHaveBeenCalled()
  })

  it.each(['{', 'null', '[]', 'true', '{}', '{"repository":null}'])('rejects malformed payload %s', async body => {
    expect((await POST(delivery(body))).status).toBe(400)
    expect(network).not.toHaveBeenCalled()
  })

  it.each([
    { id: '42' }, { id: 0 }, { id: Number.MAX_SAFE_INTEGER + 1 },
    { name: '' }, { full_name: 'invalid' }, { description: {} },
    { html_url: 'javascript:alert(1)' }, { language: [] },
    { stargazers_count: -1 }, { stargazers_count: 1.5 },
    { pushed_at: 'yesterday' }, { pushed_at: 123 }, { language: undefined },
  ])('rejects invalid repository fields %j', async fields => {
    expect((await POST(delivery(JSON.stringify({ repository: { ...repository, ...fields } })))).status).toBe(400)
    expect(network).not.toHaveBeenCalled()
  })

  it('acknowledges a signed ping without repository or database configuration', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined)
    const response = await POST(delivery('{"zen":"test"}', { 'x-github-event': 'ping' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true })
    expect(network).not.toHaveBeenCalled()
  })
})

describe('GitHub webhook database behavior', () => {
  it.each(['push', 'repository'])('updates every matching project for %s using only service credentials', async event => {
    const rows = [
      { id: 'first', user_id: 'alice', github_repo_id: 42, name: 'old' },
      { id: 'second', user_id: 'bob', github_repo_id: 42, name: 'old' },
      { id: 'third', user_id: 'alice', github_repo_id: 99, name: 'unrelated' },
    ]
    network.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      expect(url.pathname).toBe('/rest/v1/projects')
      expect(request.method).toBe('PATCH')
      expect(request.headers.get('authorization')).toBe('Bearer service-role-test-key')
      expect(request.headers.get('apikey')).toBe('service-role-test-key')
      expect(request.headers.get('cookie')).toBeNull()
      const changes = await request.json()
      expect(changes).toEqual({
        name: repository.name, full_name: repository.full_name,
        description: null, html_url: repository.html_url, language: repository.language,
        stargazers_count: 7, pushed_at: repository.pushed_at, updated_at: expect.any(String),
      })
      for (const row of rows) {
        if (url.searchParams.get('github_repo_id') === `eq.${row.github_repo_id}`) Object.assign(row, changes)
      }
      return new Response(null, { status: 204 })
    })
    const response = await POST(delivery(undefined, {
      'x-github-event': event,
      'content-type': 'application/json; charset=utf-8',
      cookie: 'sb-access-token=user-token',
      authorization: 'Bearer user-token',
    }))
    expect(response.status).toBe(200)
    expect(rows.map(row => row.name)).toEqual(['updated', 'updated', 'unrelated'])
    expect(rows.map(row => row.user_id)).toEqual(['alice', 'bob', 'alice'])
  })

  it('acknowledges an untracked repository with no returned rows', async () => {
    expect((await POST(delivery())).status).toBe(200)
    expect(network).toHaveBeenCalled()
  })

  it.each(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])('fails closed without %s', async key => {
    vi.stubEnv(key, '')
    const response = await POST(delivery())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Webhook processing failed' })
    expect(network).not.toHaveBeenCalled()
  })

  it('does not acknowledge database errors or expose their details', async () => {
    network.mockResolvedValue(new Response(JSON.stringify({ message: 'private database details', code: '42501' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    }))
    const response = await POST(delivery())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Webhook processing failed' })
  })

  it('sanitizes transport failures', async () => {
    network.mockRejectedValue(new Error('private transport details'))
    const response = await POST(delivery())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Webhook processing failed' })
  })
})
