-- Add this to setup.sql or run in SQL editor

create or replace function match_project_embeddings (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  user_id_param uuid
)
returns table (
  id uuid,
  project_id uuid,
  content text,
  similarity float
)
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select
    pe.id,
    pe.project_id,
    pe.content,
    1 - (pe.embedding <=> query_embedding) as similarity
  from public.project_embeddings pe
  join public.projects p on p.id = pe.project_id
  where p.user_id = user_id_param
    and p.user_id = auth.uid()
    and pe.source not like 'readme:history:%'
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;

create or replace function public.match_project_embeddings_for_project (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  user_id_param uuid,
  project_id_param uuid
)
returns table (
  id uuid,
  project_id uuid,
  content text,
  similarity float
)
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select
    pe.id,
    pe.project_id,
    pe.content,
    1 - (pe.embedding <=> query_embedding) as similarity
  from public.project_embeddings pe
  join public.projects p on p.id = pe.project_id
  where p.user_id = user_id_param
    and p.user_id = auth.uid()
    and pe.project_id = project_id_param
    and pe.source not like 'readme:history:%'
    and 1 - (pe.embedding <=> query_embedding) > match_threshold
  order by pe.embedding <=> query_embedding
  limit match_count;
end;
$$;
