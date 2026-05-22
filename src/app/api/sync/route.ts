import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fetchGithubRepos } from '@/lib/github/api'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Attempt to get the provider token (GitHub PAT) from the session or a secure store
    // Note: If provider_token is not available, we may need the user to supply a PAT in their profile.
    const providerToken = session.provider_token

    if (!providerToken) {
      return NextResponse.json({ 
        error: 'No GitHub provider token found. Please re-authenticate or provide a Personal Access Token.' 
      }, { status: 400 })
    }

    // Fetch repos from GitHub
    const repos = await fetchGithubRepos(providerToken)

    // Sync to Supabase projects table
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    let syncedCount = 0

    for (const repo of repos) {
      // Upsert project
      const { error } = await supabase.from('projects').upsert({
        user_id: profile.id,
        github_repo_id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        language: repo.language,
        homepage: repo.homepage,
        stargazers_count: repo.stargazers_count,
        pushed_at: repo.pushed_at,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,github_repo_id'
      })

      if (error) {
        console.error('Error upserting repo', repo.name, error)
      } else {
        syncedCount++
      }
      
      // Note: Triggering AI processing (Gemini) can be done asynchronously via another background worker/route
      // or here if we want to wait, but it's better to queue it to avoid Vercel 10s timeouts.
    }

    return NextResponse.json({ message: 'Sync complete', syncedCount })

  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
