import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from './route'

const io = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), from: vi.fn(), eval: vi.fn(), get: vi.fn(), set: vi.fn(), embed: vi.fn(), generate: vi.fn(), update: vi.fn(), upsert: vi.fn(), maybeSingle: vi.fn(), storeToken: vi.fn(), getToken: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }))
vi.mock('@/lib/github-token-store', () => ({ storeGithubToken: io.storeToken, getStoredGithubToken: io.getToken }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: io.getUser, getSession: io.getSession }, from: io.from }) }))
vi.mock('@upstash/redis', () => ({ Redis: class { eval = io.eval; get = io.get; set = io.set } }))
vi.mock('@google/genai', () => ({ GoogleGenAI: class {
  models = { embedContent: io.embed, generateContent: io.generate }
} }))
const userId = '12345678-1234-1234-1234-123456789abc'
const projectId = '22345678-1234-1234-1234-123456789abc'
const project = { id: projectId, user_id: userId, name: 'project', full_name: 'owner/project' }
const rows = new Map<string, unknown>()
function request() { return new Request('https://app.test/api/process-project', { method: 'POST', body: JSON.stringify({ projectId }) }) }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  rows.clear()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
  io.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  io.getSession.mockResolvedValue({ data: { session: { user: { id: userId }, provider_token: 'token' } }, error: null })
  io.eval.mockImplementation(async (script: string) => script.includes("'INCR'") ? [1, 60] : 1)
  io.set.mockResolvedValue('OK')
  io.get.mockResolvedValue('README')
  io.generate.mockResolvedValue({ text: 'SUMMARY: A project\nTECHNOLOGIES: TypeScript' })
  io.embed.mockResolvedValue({ embeddings: [{ values: Array(768).fill(0.1) }] })
  io.maybeSingle.mockResolvedValue({ data: project, error: null })
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: io.update, upsert: io.upsert, maybeSingle: io.maybeSingle }
  io.update.mockReturnValue(query)
  io.upsert.mockImplementation(async (row, options) => {
    if (options.onConflict !== 'project_id,source') throw new Error('Missing conflict key')
    rows.set(`${row.project_id}:${row.source}`, row)
    return { error: null }
  })
  io.from.mockReturnValue(query)
})
afterEach(() => vi.unstubAllEnvs())
it('keeps one current README embedding across repeated processing', async () => {
  expect((await POST(request())).status).toBe(200)
  io.get.mockResolvedValue('NEW README')
  expect((await POST(request())).status).toBe(200)
  expect(rows.size).toBe(1)
  expect(rows.get(`${projectId}:readme`)).toEqual(expect.objectContaining({ content: 'NEW README', source: 'readme' }))
})
it('embeds and stores the same complete Unicode README prefix', async () => {
  const content = 'a'.repeat(7999) + '\u{1F600}'
  io.get.mockResolvedValue(content + 'tail')
  expect((await POST(request())).status).toBe(200)
  expect(io.embed).toHaveBeenCalledWith(expect.objectContaining({ contents: content }))
  expect(rows.get(`${projectId}:readme`)).toEqual(expect.objectContaining({ content }))
})
it('distinguishes valid empty output from extraction failure', async () => {
  io.generate.mockResolvedValue({ text: 'SUMMARY: \nTECHNOLOGIES: ' })
  expect((await POST(request())).status).toBe(200)
  expect(io.update).toHaveBeenCalledWith({ summary: '', technologies: [] })
})
it.each(['provider', 'malformed', 'embedding'])('preserves existing summary and technologies on %s failure', async failure => {
  if (failure === 'provider') io.generate.mockRejectedValue(new Error('secret'))
  if (failure === 'malformed') io.generate.mockResolvedValue({ text: 'not structured' })
  if (failure === 'embedding') io.embed.mockRejectedValue(new Error('secret'))
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret')
  expect(io.update).not.toHaveBeenCalled()
  expect(io.upsert).not.toHaveBeenCalled()
  expect(io.eval.mock.calls.some(([script]) => script.includes("'DEL'"))).toBe(true)
})
it.each([[], [1, 2, 3], Array(769).fill(1), Array(768).fill(0), [...Array(767).fill(1), NaN]])('does not write malformed embedding %#', async values => {
  io.embed.mockResolvedValue({ embeddings: [{ values }] })
  expect((await POST(request())).status).toBe(503)
  expect(io.update).not.toHaveBeenCalled()
  expect(io.upsert).not.toHaveBeenCalled()
})
it.each(['lookup', 'update', 'missing-update', 'upsert'])('reports database %s failure', async failure => {
  if (failure === 'lookup') io.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('secret') })
  if (failure === 'update' || failure === 'missing-update') io.maybeSingle.mockResolvedValueOnce({ data: project, error: null }).mockResolvedValueOnce({ data: null, error: failure === 'update' ? new Error('secret') : null })
  if (failure === 'upsert') io.upsert.mockResolvedValue({ error: new Error('secret') })
  const response = await POST(request())
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret')
  if (failure !== 'upsert') expect(io.upsert).not.toHaveBeenCalled()
})
it('rejects concurrent processing before provider calls', async () => {
  io.set.mockResolvedValue(null)
  expect((await POST(request())).status).toBe(409)
  expect(io.generate).not.toHaveBeenCalled()
  expect(io.get).not.toHaveBeenCalled()
})
it('fails closed when Redis lock acquisition fails', async () => {
  io.set.mockRejectedValue(new Error('secret'))
  expect((await POST(request())).status).toBe(503)
  expect(io.generate).not.toHaveBeenCalled()
})
it('does not hide release failure after successful writes', async () => {
  io.eval.mockImplementation(async (script: string) => {
    if (script.includes("'DEL'")) throw new Error('secret')
    return script.includes("'INCR'") ? [1, 60] : 1
  })
  expect((await POST(request())).status).toBe(503)
  expect(io.upsert).toHaveBeenCalled()
})
it('does not write after losing its lease during provider processing', async () => {
  io.eval.mockImplementation(async (script: string) => script.includes("'INCR'") ? [1, 60] : 0)
  expect((await POST(request())).status).toBe(503)
  expect(io.update).not.toHaveBeenCalled()
})
it('releases its lease when no README exists', async () => {
  io.get.mockResolvedValue('')
  expect(await (await POST(request())).json()).toEqual({ message: 'No README found', updated: false })
  expect(io.generate).not.toHaveBeenCalled()
  expect(io.eval.mock.calls.some(([script]) => script.includes("'DEL'"))).toBe(true)
})
