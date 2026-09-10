export async function readBodyBytes(body: Pick<Request, 'body'>, maxBytes: number): Promise<Uint8Array> {
  if (!body.body) return new Uint8Array()
  const reader = body.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength > maxBytes - length) throw new Error('Body exceeds size limit')
      length += value.byteLength
      if (value.byteLength) chunks.push(value.slice())
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } catch (error) {
    void reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}
