import { NextResponse } from 'next/server'

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message)
  }
}

export function apiErrorResponse(error: unknown) {
  const known = error instanceof ApiError
  return NextResponse.json({ error: known ? error.message : 'Service temporarily unavailable' }, {
    status: known ? error.status : 503,
    headers: known && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined,
  })
}

export async function readJsonBody(request: Request, maxBytes = 65536, options: { allowEmpty?: boolean } = {}): Promise<unknown> {
  const length = request.headers.get('content-length')
  if (length && Number(length) > maxBytes) throw new ApiError(400, 'Request body too large')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'Invalid JSON body')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new ApiError(400, 'Request body too large')
      }
      chunks.push(value)
    }
    if (size === 0 && options.allowEmpty) return undefined
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'Invalid JSON body')
  } finally {
    reader.releaseLock()
  }
}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid request body')
  return value as Record<string, unknown>
}

export function parseProjectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, 'Invalid projectId')
  }
  return value.toLowerCase()
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function parseChatBody(value: unknown): { messages: ChatMessage[]; projectId?: string } {
  const body = objectBody(value)
  const projectId = body.projectId === undefined ? undefined : parseProjectId(body.projectId)
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 40) throw new ApiError(400, 'Invalid messages')
  let total = 0
  const messages = body.messages.map(value => {
    const message = objectBody(value)
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string'
      || !message.content.trim() || message.content.length > 8000) throw new ApiError(400, 'Invalid messages')
    total += message.content.length
    return { role: message.role, content: message.content } as ChatMessage
  })
  if (total > 32000 || messages[messages.length - 1].role !== 'user') throw new ApiError(400, 'Invalid messages')
  return { messages, projectId }
}
