export function requiredEnv(name: string, value: string | undefined): string {
  if (!value?.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`Invalid environment variable: ${name}`)
  return value.trim()
}

export function originEnv(name: string, value: string | undefined, allowHttp = false): string {
  const input = requiredEnv(name, value)
  try {
    if (/[\\\s]/.test(input)) throw new Error()
    const url = new URL(input)
    if ((url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:'))
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || input.includes('?') || input.includes('#')) throw new Error()
    return url.origin
  } catch {
    throw new Error(`Invalid environment variable: ${name}`)
  }
}
