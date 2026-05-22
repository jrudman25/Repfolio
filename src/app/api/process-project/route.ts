import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fetchGithubReadme } from '@/lib/github/api'
import { processReadme, generateEmbedding } from '@/lib/gemini/processor'

export async function POST(request: Request) {
  try {
    const { projectId } = await request.json()
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    // Fetch project details
    const { data: project } = await supabase
      .from('projects')
      .select('name, full_name, user_id')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const providerToken = session.provider_token
    if (!providerToken) return NextResponse.json({ error: 'No GitHub token' }, { status: 400 })

    const [owner, repo] = project.full_name.split('/')
    
    // Fetch README
    const readme = await fetchGithubReadme(owner, repo, providerToken)
    if (!readme) return NextResponse.json({ message: 'No README found', updated: false })

    // Process with Gemini
    const { summary, technologies } = await processReadme(readme, project.name)

    // Update project with summary and tech
    await supabase.from('projects').update({
      summary,
      technologies
    }).eq('id', projectId)

    // Generate embedding for the README
    const embedding = await generateEmbedding(readme.substring(0, 8000))
    if (embedding) {
      // Upsert embedding into project_embeddings
      await supabase.from('project_embeddings').insert({
        project_id: projectId,
        content: readme.substring(0, 8000), // store chunk
        embedding,
        metadata: { source: 'README' }
      })
    }

    return NextResponse.json({ message: 'Processed successfully', summary, technologies })

  } catch (error) {
    console.error('Process project error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
