import { expect, it } from 'vitest'
import { apiErrorResponse, parseChatBody, parseProjectId, readJsonBody } from './api-validation'

it.each(['{', ''])('rejects malformed JSON %s', async body => {
  await expect(readJsonBody(new Request('https://app.test', { method: 'POST', body }))).rejects.toMatchObject({ status: 400 })
})
it('accepts an empty stream only when the endpoint explicitly allows it', async () => {
  const request = () => new Request('https://app.test', { method: 'POST', body: '' })
  await expect(readJsonBody(request())).rejects.toMatchObject({ status: 400 })
  await expect(readJsonBody(request(), 1024, { allowEmpty: true })).resolves.toBeUndefined()
})
it('bounds streamed bytes even with a lying content-length and cancels', async () => {
  let cancelled = false
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(16)) }, cancel() { cancelled = true } })
  const request = new Request('https://app.test', { method: 'POST', body, headers: { 'content-length': '1' }, duplex: 'half' } as RequestInit)
  await expect(readJsonBody(request, 20)).rejects.toMatchObject({ status: 400 })
  expect(cancelled).toBe(true)
})
it('counts multibyte data as bytes and accepts boundary', async () => {
  const body = JSON.stringify('é')
  expect(await readJsonBody(new Request('https://app.test', { method: 'POST', body }), 4)).toBe('é')
  await expect(readJsonBody(new Request('https://app.test', { method: 'POST', body }), 3)).rejects.toMatchObject({ status: 400 })
})
it.each([null, [], {}, 'x', '123', 4])('rejects non UUID %j', value => expect(() => parseProjectId(value)).toThrow())
it.each([
  null, [], {}, { messages: [] }, { messages: [{ role: 'system', content: 'x' }] },
  { messages: [{ role: 'assistant', content: 'x' }] }, { messages: [{ role: 'user', content: ' ' }] },
  { messages: [{ role: 'user', content: 'x'.repeat(8001) }] },
  { messages: Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' })) },
  { messages: Array.from({ length: 5 }, () => ({ role: 'user', content: 'x'.repeat(8000) })) },
  { messages: [{ role: 'user', content: 'x' }], projectId: null },
])('rejects invalid chat %j', body => expect(() => parseChatBody(body)).toThrow())
it('accepts bounded conversation and UUID', () => {
  const body = { messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }, { role: 'user', content: 'why?' }], projectId: '12345678-1234-1234-1234-123456789abc' }
  expect(parseChatBody(body)).toEqual(body)
})
it('sanitizes unknown dependency errors', async () => {
  const response = apiErrorResponse(new Error('secret'))
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret')
})
