import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProjectDetailClient from '@/components/ProjectDetailClient'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch project details
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project || project.user_id !== user.id) {
    redirect('/')
  }

  // Fetch milestones
  const { data: milestones } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  // Fetch todos
  const { data: todos } = await supabase
    .from('todos')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  return (
    <ProjectDetailClient 
      project={project} 
      initialMilestones={milestones || []} 
      initialTodos={todos || []} 
    />
  )
}
