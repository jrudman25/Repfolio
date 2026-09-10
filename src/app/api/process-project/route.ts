import { NextResponse } from 'next/server'
import { authenticateUser, getProviderToken, requireProject } from '@/lib/api-auth'
import { apiErrorResponse, objectBody, parseProjectId, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { acquireProcessingLock } from '@/lib/processing-lock'
import { fetchGithubReadme } from '@/lib/github/api'
import { processReadme, generateEmbedding } from '@/lib/gemini/processor'

export async function POST(request: Request) {
  try {
    const context = await authenticateUser()
    const { supabase, userId } = context
    const projectId = parseProjectId(objectBody(await readJsonBody(request, 1024)).projectId)
    await enforceRateLimit(context, 'process-project')
    
    // Fetch project details
    const project = await requireProject(context, projectId)

    const providerToken = await getProviderToken(context)
    const lock = await acquireProcessingLock(context, projectId)
    try {
      const [owner, repo] = project.full_name.split('/')

      // Fetch README
      const readme = await fetchGithubReadme(owner, repo, { userId, accessToken: providerToken })
      if (!readme) return NextResponse.json({ message: 'No README found', updated: false })

      // Process with Gemini
      const result = await processReadme(readme, project.name)
      if (!result.ok) throw new Error('Processing unavailable')
      const { summary, technologies } = result
      const readmeChunk = Array.from(readme).slice(0, 8000).join('')

      // Generate embedding for the README
      const embedding = await generateEmbedding(readmeChunk)
      if (!embedding?.length) throw new Error('Embedding unavailable')
      await lock.renew()

      // Update project with summary and tech
      const { data: updated, error: updateError } = await supabase.from('projects').update({
        summary,
        technologies
      }).eq('id', projectId).eq('user_id', userId).select('id').maybeSingle()
      if (updateError || !updated) throw new Error('Project update failed')

      if (embedding) {
        // Upsert embedding into project_embeddings
        const { error: embeddingError } = await supabase.from('project_embeddings').upsert({
          project_id: projectId,
          source: 'readme',
          content: readmeChunk, // store chunk
          embedding,
          metadata: { source: 'README' }
        }, { onConflict: 'project_id,source' })
        if (embeddingError) throw embeddingError
      }

      return NextResponse.json({ message: 'Processed successfully', summary, technologies })
    } finally {
      await lock.release()
    }
  } catch (error) {
    return apiErrorResponse(error)
  }
}
