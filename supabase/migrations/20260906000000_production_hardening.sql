begin;

set local search_path = public, extensions, pg_temp;

lock table public.projects, public.project_embeddings in access exclusive mode;

alter table public.projects alter column github_repo_id type bigint;
alter table public.project_embeddings add column if not exists source text;

do $$
begin
  if exists (
    select 1 from public.project_embeddings
    where source is not null
    group by project_id, source having count(*) > 1
  ) then
    raise exception 'Migration prerequisite: resolve duplicate explicit embedding sources without deleting historical data, then retry';
  end if;
  if exists (
    select 1 from public.project_embeddings old
    join public.project_embeddings current on current.project_id = old.project_id and current.source = 'readme'
    where old.source is null and lower(old.metadata->>'source') = 'readme'
  ) then
    raise exception 'Migration prerequisite: mixed legacy and current README sources require an operator-reviewed latest-row mapping; no data has been changed';
  end if;
  if exists (
    select 1 from public.project_embeddings old
    join public.project_embeddings existing on existing.project_id = old.project_id
      and existing.source in ('legacy:' || old.id::text, 'readme:history:' || old.id::text)
    where old.source is null
  ) then
    raise exception 'Migration prerequisite: reserved historical source collision; review source mapping before retrying';
  end if;
end;
$$;

with readmes as (
  select id, row_number() over (partition by project_id order by created_at desc, id desc) as position
  from public.project_embeddings
  where source is null and lower(metadata->>'source') = 'readme'
)
update public.project_embeddings pe
set source = case
  when r.position = 1 then 'readme'
  when r.position > 1 then 'readme:history:' || pe.id::text
  else 'legacy:' || pe.id::text
end
from public.project_embeddings original
left join readmes r on r.id = original.id
where pe.id = original.id and pe.source is null;

alter table public.project_embeddings alter column source set default ('legacy:' || gen_random_uuid()::text);
alter table public.project_embeddings alter column source set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_embeddings'::regclass
      and conname = 'project_embeddings_project_id_source_key'
  ) then
    alter table public.project_embeddings add constraint project_embeddings_project_id_source_key unique (project_id, source);
  end if;
end;
$$;

create index if not exists projects_github_repo_id_idx on public.projects (github_repo_id);
create index if not exists milestones_project_id_idx on public.milestones (project_id);
create index if not exists todos_project_id_idx on public.todos (project_id);
create index if not exists project_embeddings_embedding_cosine_idx on public.project_embeddings using hnsw (embedding vector_cosine_ops);

do $$
declare
  old_index record;
begin
  for old_index in
    select distinct ns.nspname, idx.relname
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_namespace ns on ns.oid = idx.relnamespace
    join pg_am am on am.oid = idx.relam
    join pg_opclass opc on opc.oid = any(i.indclass)
    where i.indrelid = 'public.project_embeddings'::regclass
      and am.amname = 'hnsw' and opc.opcname = 'vector_ip_ops'
  loop
    execute format('drop index %I.%I', old_index.nspname, old_index.relname);
  end loop;
end;
$$;

alter function public.handle_new_user() set search_path = '';

create or replace function public.match_project_embeddings (
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

commit;
