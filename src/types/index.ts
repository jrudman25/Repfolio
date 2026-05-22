export type Project = {
  id: string
  user_id: string
  github_repo_id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  homepage: string | null
  stargazers_count: number
  pushed_at: string | null
  summary: string | null
  technologies: string[]
  has_code_map: boolean
  created_at: string
  updated_at: string
}

export type Todo = {
  id: string
  project_id: string
  task: string
  is_completed: boolean
  created_at: string
}

export type Milestone = {
  id: string
  project_id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
}
