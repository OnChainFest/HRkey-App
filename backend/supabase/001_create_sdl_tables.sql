create table if not exists public.sdl_statements (
  id text primary key,
  subject text not null,
  key text not null,
  type text not null,
  sensitivity text not null,
  value_ref jsonb not null,
  provenance jsonb,
  proof jsonb,
  updated_at timestamptz default now(),
  valid_to timestamptz
);

create index if not exists sdl_statements_subject_key_updated_idx
  on public.sdl_statements (subject, key, updated_at desc);

create table if not exists public.sdl_consents (
  consent_id text primary key,
  subject text not null,
  grantee text not null,
  purpose text not null,
  scope jsonb not null,
  duration_from timestamptz not null,
  duration_to timestamptz not null,
  revocable boolean not null,
  created_at timestamptz default now()
);

create table if not exists public.sdl_audit_log (
  id bigserial primary key,
  subject text not null,
  actor text not null,
  action text not null,
  reason_code text,
  created_at timestamptz default now(),
  meta jsonb
);

alter table public.sdl_statements enable row level security;
alter table public.sdl_consents enable row level security;
alter table public.sdl_audit_log enable row level security;

create policy "sdl_statements_owner_read"
  on public.sdl_statements
  for select
  using (subject = auth.uid()::text);

create policy "sdl_statements_owner_insert"
  on public.sdl_statements
  for insert
  with check (subject = auth.uid()::text);

create policy "sdl_statements_owner_update"
  on public.sdl_statements
  for update
  using (subject = auth.uid()::text)
  with check (subject = auth.uid()::text);

create policy "sdl_statements_owner_delete"
  on public.sdl_statements
  for delete
  using (subject = auth.uid()::text);

create policy "sdl_consents_owner_read"
  on public.sdl_consents
  for select
  using (subject = auth.uid()::text);

create policy "sdl_consents_owner_insert"
  on public.sdl_consents
  for insert
  with check (subject = auth.uid()::text);

create policy "sdl_consents_owner_update"
  on public.sdl_consents
  for update
  using (subject = auth.uid()::text)
  with check (subject = auth.uid()::text);

create policy "sdl_consents_owner_delete"
  on public.sdl_consents
  for delete
  using (subject = auth.uid()::text);

create policy "sdl_audit_log_owner_read"
  on public.sdl_audit_log
  for select
  using (subject = auth.uid()::text);

create policy "sdl_audit_log_owner_insert"
  on public.sdl_audit_log
  for insert
  with check (subject = auth.uid()::text);
