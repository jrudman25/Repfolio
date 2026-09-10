import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { updateSession } from './proxy'

const io = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: (...args: unknown[]) => { io.create(...args); return { auth: { getUser: io.getUser } } } }))
beforeEach(() => {
  vi.clearAllMocks()
  io.getUser.mockResolvedValue({ data: { user: null } })
})
it.each(['/api', '/api/chat', '/api/sync', '/api/webhooks/github'])('lets %s authenticate in its own handler', async path => {
  const response = await updateSession(new NextRequest(`https://app.test${path}`))
  expect(response.headers.get('location')).toBeNull()
  expect(io.create).not.toHaveBeenCalled()
})
it('verifies a user before serving a protected page', async () => {
  const response = await updateSession(new NextRequest('https://app.test/projects'))
  expect(io.getUser).toHaveBeenCalledOnce()
  expect(response.headers.get('location')).toBe('https://app.test/login')
})
it('allows a verified user', async () => {
  io.getUser.mockResolvedValue({ data: { user: { id: 'alice' } } })
  const response = await updateSession(new NextRequest('https://app.test/projects'))
  expect(response.headers.get('location')).toBeNull()
})
it.each(['/login', '/auth/callback'])('allows public auth path %s', async path => {
  expect((await updateSession(new NextRequest(`https://app.test${path}`))).headers.get('location')).toBeNull()
})
