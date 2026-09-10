import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProjectDetailClient from './ProjectDetailClient'
import type { Project } from '@/types'

const database = vi.hoisted(() => ({ eq: vi.fn(), single: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from: () => ({
    update: database.update,
    delete: database.delete,
    insert: database.insert,
  }) }),
}))

const project: Project = {
  id: 'p1', user_id: 'u1', github_repo_id: 1, name: 'Example', full_name: 'owner/Example',
  description: null, html_url: 'https://github.com/owner/Example', language: null,
  homepage: null, stargazers_count: 0, pushed_at: null, summary: null, technologies: [],
  has_code_map: false, created_at: '2026-01-01', updated_at: '2026-01-01',
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  database.eq.mockResolvedValue({ error: null })
  database.update.mockReturnValue({ eq: database.eq })
  database.delete.mockReturnValue({ eq: database.eq })
  database.insert.mockReturnValue({ select: () => ({ single: database.single }) })
})
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.clearAllMocks() })

it('exposes completion state and named delete controls', async () => {
  render(<ProjectDetailClient project={project}
    initialMilestones={[{ id: 'm1', project_id: 'p1', title: 'Release', status: 'pending', created_at: '' }]}
    initialTodos={[{ id: 't1', project_id: 'p1', task: 'Write docs', is_completed: false, created_at: '' }]} />)
  const milestone = screen.getByRole('button', { name: 'Complete milestone: Release' })
  const task = screen.getByRole('button', { name: 'Complete task: Write docs' })
  expect(milestone).toHaveAttribute('aria-pressed', 'false')
  expect(task).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(milestone)
  fireEvent.click(task)
  await waitFor(() => {
    expect(milestone).toHaveAttribute('aria-pressed', 'true')
    expect(task).toHaveAttribute('aria-pressed', 'true')
  })
  fireEvent.click(task)
  await waitFor(() => expect(task).toHaveAttribute('aria-pressed', 'false'))
  const remove = screen.getByRole('button', { name: 'Delete task: Write docs' })
  remove.focus()
  expect(remove).toHaveFocus()
  fireEvent.click(remove)
  expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
})

it('submits named task and milestone forms', async () => {
  render(<ProjectDetailClient project={project} initialMilestones={[]} initialTodos={[]} />)
  database.single.mockResolvedValueOnce({ data: { id: 't2', task: 'Test app', is_completed: false } })
  fireEvent.change(screen.getByRole('textbox', { name: 'New task' }), { target: { value: 'Test app' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Add task' }))
  expect(await screen.findByRole('button', { name: 'Complete task: Test app' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('textbox', { name: 'New task' })).toHaveValue('')
  database.single.mockResolvedValueOnce({ data: { id: 'm2', title: 'Launch', status: 'pending' } })
  const form = screen.getByRole('form', { name: 'Add milestone' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'New milestone' }), { target: { value: 'Launch' } })
  fireEvent.submit(form)
  expect(await screen.findByRole('button', { name: 'Complete milestone: Launch' })).toHaveAttribute('aria-pressed', 'false')
})
