create table if not exists onboarding_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  coupon text,
  source text,
  created_at timestamptz default now()
);
