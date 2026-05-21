import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateEmbedding } from '@/lib/gemini/processor'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
// Using Gemini 3.1 Pro for the Chatbot as requested
const chatModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }) // fallback to 1.5 pro in SDK if 3.1 pro string is different

export async function POST(request: Request) {
  try {
    const { messages, projectId } = await request.json()
    const lastMessage = messages[messages.length - 1].content

    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Generate embedding for the user query
    const queryEmbedding = await generateEmbedding(lastMessage)

    let contextText = ''

    if (queryEmbedding) {
      // Query pgvector for relevant context
      // Note: Make sure match_project_embeddings function exists in DB
      let query = supabase.rpc('match_project_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 5,
        user_id_param: session.user.id
      })

      if (projectId) {
        // If chatting within a specific project, filter context
        query = query.eq('project_id', projectId)
      }

      const { data: matchedDocs, error } = await query

      if (!error && matchedDocs && matchedDocs.length > 0) {
        contextText = matchedDocs.map((doc: any) => doc.content).join('\n\n')
      }
    }

    const systemPrompt = `
      You are an AI assistant in Repfolio, helping the user understand their GitHub portfolio.
      You have access to the following context about their projects (from READMEs, code maps, etc.):
      
      CONTEXT:
      ${contextText}
      
      If the user asks a question, use the context to answer. If you don't know the answer based on the context, say so, but you can also use your general programming knowledge.
    `

    const formattedMessages = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))

    // Prepend system prompt to the first message or use systemInstruction feature
    const chatSession = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      systemInstruction: systemPrompt
    }).startChat({
      history: formattedMessages.slice(0, -1)
    })

    const result = await chatSession.sendMessage(lastMessage)
    const responseText = result.response.text()

    return NextResponse.json({ role: 'assistant', content: responseText })

  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
