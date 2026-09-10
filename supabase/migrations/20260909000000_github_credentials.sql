begin;

create table if not exists public.github_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_token text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.github_credentials enable row level security;
revoke all on table public.github_credentials from anon, authenticated;
grant select, insert, update, delete on table public.github_credentials to service_role;

commit;
