import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const sql = (name: string) => readFileSync(resolve(process.cwd(), 'supabase', name), 'utf8').toLowerCase()
const migration = sql('migrations/20260906000000_production_hardening.sql')
const setup = sql('setup.sql')
const functions = sql('functions.sql')

it('keeps the migration transactional and free of row deletion or RLS weakening', () => {
  expect(migration.trim()).toMatch(/^begin;[\s\S]*commit;$/)
  expect(migration).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b|\bdisable\s+row\s+level\s+security\b|\bdrop\s+policy\b/)
  expect(migration).toContain('raise exception')
  expect(migration).toContain("'readme:history:' || pe.id::text")
  expect(migration).toContain("'legacy:' || pe.id::text")
  expect(migration).toContain('order by created_at desc, id desc')
})
it('aligns fresh setup and migration uniqueness, cosine search and indexes', () => {
  for (const text of [setup, migration]) {
    expect(text).toMatch(/github_repo_id (?:type )?bigint/)
    expect(text).toMatch(/unique\s*\(project_id, source\)/)
    expect(text).toContain('embedding vector_cosine_ops')
    expect(text).toContain('projects_github_repo_id_idx')
    expect(text).toContain('milestones_project_id_idx')
    expect(text).toContain('todos_project_id_idx')
    expect(text).toContain("set search_path = ''")
  }
  expect(migration).toContain("opc.opcname = 'vector_ip_ops'")
})
it.each(['match_project_embeddings', 'match_project_embeddings_for_project'])('keeps %s identical in deployed and standalone SQL with filtering before ranking', name => {
  const definition = (text: string) => {
    const match = text.match(new RegExp(`create or replace function (?:public\\.)?${name}\\s*\\(([\\s\\S]*?)\\$\\$;`))
    expect(match).not.toBeNull()
    return match![1].trim()
  }
  const standalone = definition(functions)
  expect(definition(migration)).toBe(standalone)
  const parameters = standalone.slice(0, standalone.indexOf('returns table')).replace(/\s+/g, ' ').trim()
  expect(parameters).toBe(`query_embedding vector(768), match_threshold float, match_count int, user_id_param uuid${name.endsWith('_for_project') ? ', project_id_param uuid' : ''} )`)
  expect(standalone).toContain('security invoker')
  expect(standalone).toContain('set search_path = public, extensions, pg_temp')
  expect(standalone).not.toContain('security definer')
  const where = standalone.slice(standalone.indexOf('where '), standalone.indexOf('order by '))
  expect(where).toContain('p.user_id = auth.uid()')
  expect(where).toContain('p.user_id = user_id_param')
  expect(where).toContain("pe.source not like 'readme:history:%'")
  expect(where).toContain('1 - (pe.embedding <=> query_embedding) > match_threshold')
  if (name.endsWith('_for_project')) expect(where).toContain('pe.project_id = project_id_param')
  else expect(standalone).not.toContain('project_id_param')
  expect(standalone).toMatch(/order by pe\.embedding <=> query_embedding\s+limit match_count;/)
  expect(migration.indexOf(`function public.${name} (`)).toBeLessThan(migration.lastIndexOf('commit;'))
  expect(migration).not.toMatch(/drop\s+function/i)
})
