-- Enable pgvector extension
create extension if not exists vector;

-- Create profiles table
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  github_username text unique not null,
  avatar_url text,
  full_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create projects table
create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  github_repo_id bigint not null,
  name text not null,
  full_name text not null,
  description text,
  html_url text not null,
  language text,
  homepage text,
  stargazers_count integer default 0,
  pushed_at timestamp with time zone,
  summary text,
  technologies text[] default '{}',
  has_code_map boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, github_repo_id)
);

-- Create milestones table
create table milestones (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  title text not null,
  description text,
  status text check (status in ('pending', 'in_progress', 'completed')) default 'pending',
  due_date timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create todos table
create table todos (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  task text not null,
  is_completed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create project_embeddings table for RAG
create table project_embeddings (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  content text not null, -- The text being embedded (e.g. README chunk)
  embedding vector(768), -- Gemini embeddings are typically 768 dimensions
  metadata jsonb default '{}'::jsonb, -- e.g., source file name, chunk index
  source text not null default ('legacy:' || gen_random_uuid()::text),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, source)
);

-- Create index for vector similarity search
create index project_embeddings_embedding_cosine_idx on project_embeddings using hnsw (embedding vector_cosine_ops);
create index projects_github_repo_id_idx on projects (github_repo_id);
create index milestones_project_id_idx on milestones (project_id);
create index todos_project_id_idx on todos (project_id);

-- RLS Setup
alter table profiles enable row level security;
alter table projects enable row level security;
alter table milestones enable row level security;
alter table todos enable row level security;
alter table project_embeddings enable row level security;

-- Profiles policies
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Projects policies
create policy "Users can view own projects" on projects for select using (auth.uid() = user_id);
create policy "Users can insert own projects" on projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects" on projects for update using (auth.uid() = user_id);
create policy "Users can delete own projects" on projects for delete using (auth.uid() = user_id);

-- Milestones policies
create policy "Users can view own project milestones" on milestones for select using (
  exists (select 1 from projects where projects.id = milestones.project_id and projects.user_id = auth.uid())
);
create policy "Users can insert own project milestones" on milestones for insert with check (
  exists (select 1 from projects where projects.id = milestones.project_id and projects.user_id = auth.uid())
);
create policy "Users can update own project milestones" on milestones for update using (
  exists (select 1 from projects where projects.id = milestones.project_id and projects.user_id = auth.uid())
);
create policy "Users can delete own project milestones" on milestones for delete using (
  exists (select 1 from projects where projects.id = milestones.project_id and projects.user_id = auth.uid())
);

-- Todos policies
create policy "Users can view own project todos" on todos for select using (
  exists (select 1 from projects where projects.id = todos.project_id and projects.user_id = auth.uid())
);
create policy "Users can insert own project todos" on todos for insert with check (
  exists (select 1 from projects where projects.id = todos.project_id and projects.user_id = auth.uid())
);
create policy "Users can update own project todos" on todos for update using (
  exists (select 1 from projects where projects.id = todos.project_id and projects.user_id = auth.uid())
);
create policy "Users can delete own project todos" on todos for delete using (
  exists (select 1 from projects where projects.id = todos.project_id and projects.user_id = auth.uid())
);

-- Project Embeddings policies
create policy "Users can view own project embeddings" on project_embeddings for select using (
  exists (select 1 from projects where projects.id = project_embeddings.project_id and projects.user_id = auth.uid())
);
create policy "Users can insert own project embeddings" on project_embeddings for insert with check (
  exists (select 1 from projects where projects.id = project_embeddings.project_id and projects.user_id = auth.uid())
);
create policy "Users can update own project embeddings" on project_embeddings for update using (
  exists (select 1 from projects where projects.id = project_embeddings.project_id and projects.user_id = auth.uid())
);
create policy "Users can delete own project embeddings" on project_embeddings for delete using (
  exists (select 1 from projects where projects.id = project_embeddings.project_id and projects.user_id = auth.uid())
);

-- Trigger to create profile on sign up
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, github_username, avatar_url, full_name)
  values (
    new.id,
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
