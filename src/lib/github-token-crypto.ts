import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getGithubTokenEncryptionKey } from './env-server'

const VERSION = 'v1'

export function encryptGithubToken(userId: string, accessToken: string): string {
  if (!accessToken.trim()) throw new Error('Invalid GitHub provider token')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getGithubTokenEncryptionKey(), iv)
  cipher.setAAD(Buffer.from(userId, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(accessToken, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptGithubToken(userId: string, encryptedToken: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = encryptedToken.split('.')
  if (version !== VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) throw new Error('Invalid encrypted GitHub token')
  const iv = Buffer.from(encodedIv, 'base64url')
  const tag = Buffer.from(encodedTag, 'base64url')
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted GitHub token')
  const decipher = createDecipheriv('aes-256-gcm', getGithubTokenEncryptionKey(), iv)
  decipher.setAAD(Buffer.from(userId, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, 'base64url')), decipher.final()]).toString('utf8')
}
