import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// Primary and fallback models
const EXTRACTION_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite']
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-2' })

export async function processReadme(readmeContent: string, projectName: string) {
  const prompt = `
    Analyze the following README for a GitHub repository named "${projectName}".
    1. Provide a short 1-2 sentence summary of what the project does.
    2. List the core technologies/frameworks/languages used in the project. Return them as a comma-separated list.
    
    Format your response EXACTLY as follows (no markdown blocks, just the text):
    SUMMARY: <your summary>
    TECHNOLOGIES: <tech1, tech2, tech3>
    
    README CONTENT:
    ${readmeContent.substring(0, 15000)}
  `

  try {
    let text = ''
    let success = false

    for (const modelName of EXTRACTION_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName })
        const result = await model.generateContent(prompt)
        text = result.response.text()
        success = true
        break
      } catch (err) {
        console.warn(`Model ${modelName} failed for README extraction, falling back...`, err)
      }
    }

    if (!success) throw new Error('All models failed to process README')

    const summaryMatch = text.match(/SUMMARY:\s*(.*)/i)
    const techMatch = text.match(/TECHNOLOGIES:\s*(.*)/i)

    const summary = summaryMatch ? summaryMatch[1].trim() : ''
    const technologies = techMatch
      ? techMatch[1].split(',').map(t => t.trim()).filter(Boolean)
      : []

    return { summary, technologies }
  } catch (error) {
    console.error(`Error processing README for ${projectName}:`, error)
    return { summary: '', technologies: [] }
  }
}

export async function generateEmbedding(text: string) {
  try {
    // gemini-embedding-2 defaults to 3072 dimensions. Because it uses Matryoshka Representation Learning (MRL),
    // we can safely truncate it to 768 dimensions to remain compatible with our pgvector schema.
    const result = await embeddingModel.embedContent(text)
    const embedding = result.embedding
    return embedding.values.slice(0, 768)
  } catch (error) {
    console.error('Error generating embedding:', error)
    return null
  }
}

export async function processCodeMap(codeMapContent: string) {
  // A code map is usually a structured representation of the codebase.
  // We can chunk it and generate embeddings for RAG.
  // For simplicity in this function, we just split by double newlines or sections.
  const chunks = codeMapContent.split('\n\n').filter(c => c.length > 50)

  const chunksWithEmbeddings = []

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk)
    if (embedding) {
      chunksWithEmbeddings.push({ content: chunk, embedding })
    }
  }

  return chunksWithEmbeddings
}
