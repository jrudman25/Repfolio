import { GoogleGenAI } from '@google/genai'
import { getGeminiApiKey } from '@/lib/env-server'

export const GENERATION_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'] as const
export const EMBEDDING_MODEL = 'gemini-embedding-2'
export const EMBEDDING_DIMENSIONS = 768

export function createGeminiClient() {
  const apiKey = getGeminiApiKey()
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 60000, retryOptions: { attempts: 1 } } })
}
