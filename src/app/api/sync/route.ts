import { NextResponse } from 'next/server'
import { authenticateUser, getProviderToken } from '@/lib/api-auth'
import { apiErrorResponse, objectBody, readJsonBody } from '@/lib/api-validation'
import { enforceRateLimit } from '@/lib/rate-limit'
import { fetchGithubRepos } from '@/lib/github/api'

export async function POST(request: Request) {
  let syncedCount = 0
  try {
    const context = await authenticateUser()
    const { supabase, userId } = context
    if (request.body) {
      const body = await readJsonBody(request, 1024, { allowEmpty: true })
      if (body !== undefined) objectBody(body)
    }
    await enforceRateLimit(context, 'sync')

    // Attempt to get the provider token (GitHub PAT) from the session or a secure store
    // Note: If provider_token is not available, we may need the user to supply a PAT in their profile.
    const providerToken = await getProviderToken(context)

    if (!providerToken) {
      return NextResponse.json({ 
        error: 'No GitHub provider token found. Please re-authenticate or provide a Personal Access Token.' 
      }, { status: 400 })
    }

    // Fetch repos from GitHub
    const repos = await fetchGithubRepos({ userId, accessToken: providerToken })

    // Sync to Supabase projects table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single()

    if (profileError) throw profileError
    if (!profile || profile.id !== userId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    for (let offset = 0; offset < repos.length; offset += 100) {
      const batch = repos.slice(offset, offset + 100)
      // Upsert project
      const { error } = await supabase.from('projects').upsert(batch.map(repo => ({
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
      })), {
        onConflict: 'user_id,github_repo_id'
      })

      if (error) throw error
      syncedCount += batch.length
      
      // Note: Triggering AI processing (Gemini) can be done asynchronously via another background worker/route
      // or here if we want to wait, but it's better to queue it to avoid Vercel 10s timeouts.
    }

    return NextResponse.json({ message: 'Sync complete', syncedCount })

  } catch (error) {
    const response = apiErrorResponse(error)
    return NextResponse.json({ ...await response.json(), syncedCount }, {
      status: response.status, headers: response.headers,
    })
  }
}
