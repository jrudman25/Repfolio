import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processReadme } from './processor'

// Mock the Gemini external module
vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn().mockResolvedValue({
    response: {
      text: () => 'SUMMARY: A mock project that does cool things.\nTECHNOLOGIES: React, Next.js, Tailwind CSS'
    }
  })
  
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
    embedContent: vi.fn(),
    startChat: vi.fn()
  })

  return {
    GoogleGenerativeAI: class {
      getGenerativeModel = mockGetGenerativeModel
    }
  }
})

describe('processReadme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts summary and technologies correctly from model response', async () => {
    const readmeContent = '# My Test Project\n\nThis is a cool project.'
    const projectName = 'test-project'
    
    const result = await processReadme(readmeContent, projectName)
    
    expect(result.summary).toBe('A mock project that does cool things.')
    expect(result.technologies).toEqual(['React', 'Next.js', 'Tailwind CSS'])
  })
})
