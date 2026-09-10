import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ChatWidget from './ChatWidget'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('unmounts closed chat controls, focuses the input and restores launcher focus on close and Escape', () => {
  render(<ChatWidget />)
  const launcher = screen.getByRole('button', { name: 'Open chat' })
  expect(screen.queryByRole('textbox', { hidden: true })).not.toBeInTheDocument()
  fireEvent.click(launcher)
  expect(screen.getByRole('textbox', { name: 'Chat message' })).toHaveFocus()
  expect(screen.getByText(/Answers use README content only/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
  expect(launcher).toHaveFocus()
  expect(screen.queryByRole('textbox', { hidden: true })).not.toBeInTheDocument()
  fireEvent.click(launcher)
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  expect(launcher).toHaveFocus()
  expect(screen.queryByRole('button', { name: 'Close chat', hidden: true })).not.toBeInTheDocument()
})

it('sends a message through the named form and announces the response', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: 'README answer' }) })
  vi.stubGlobal('fetch', fetchMock)
  render(<ChatWidget />)
  fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What is this project?' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Send chat message' }))
  expect(await screen.findByText('README answer')).toBeInTheDocument()
  expect(screen.getByRole('log', { name: 'Chat messages' })).toHaveTextContent('README answer')
  expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
    body: JSON.stringify({ messages: [{ role: 'user', content: 'What is this project?' }] }),
  }))
})

it.each(['response', 'network'])('does not expose raw %s errors', async failure => {
  vi.stubGlobal('fetch', failure === 'network'
    ? vi.fn().mockRejectedValue(new Error('secret internal details'))
    : vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'secret internal details' }) }))
  render(<ChatWidget />)
  fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Question' } })
  fireEvent.submit(screen.getByRole('form'))
  expect(await screen.findByText('Unable to send your message. Please try again.')).toBeInTheDocument()
  expect(screen.queryByText(/secret internal details/)).not.toBeInTheDocument()
})
