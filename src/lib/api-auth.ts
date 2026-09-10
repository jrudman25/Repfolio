import { createClient } from '@/utils/supabase/server'
import { ApiError } from './api-validation'

export async function authenticateUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new ApiError(401, 'Unauthorized')
  return { supabase, userId: user.id }
}

export async function getProviderToken(context: Awaited<ReturnType<typeof authenticateUser>>): Promise<string | undefined> {
  const { data: { session }, error } = await context.supabase.auth.getSession()
  if (error || !session || session.user.id !== context.userId) throw new ApiError(401, 'Unauthorized')
  return session.provider_token || undefined
}

export async function requireProject(context: Awaited<ReturnType<typeof authenticateUser>>, projectId: string) {
  const { data: project, error } = await context.supabase.from('projects')
    .select('id, name, full_name, user_id').eq('id', projectId).eq('user_id', context.userId).maybeSingle()
  if (error) throw new ApiError(503, 'Service temporarily unavailable')
  if (!project || project.user_id !== context.userId) throw new ApiError(404, 'Project not found')
  return project
}
