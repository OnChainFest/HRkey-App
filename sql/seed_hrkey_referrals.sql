-- Crea tablas base si aún no existen (ajusta a tu esquema real)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  referral_code text unique not null,
  referred_by text,
  subscription_expires_at timestamptz not null default now() + interval '12 months',
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_code text not null,
  referee_user_id uuid,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists users_referral_code_idx on public.users (referral_code);
create index if not exists referrals_referrer_status_idx on public.referrals (referrer_code, status);

create or replace function public.extend_referrer_one_month()
returns trigger language plpgsql as $$
begin
  if (new.status = 'confirmed' and old.status is distinct from 'confirmed') then
    update public.users u
      set subscription_expires_at = greatest(u.subscription_expires_at, now()) + interval '1 month'
      where u.referral_code = new.referrer_code;
    new.confirmed_at := now();
  end if;
  return new;
end; $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_extend_on_confirm') then
    create trigger trg_extend_on_confirm
      after update on public.referrals
      for each row execute function public.extend_referrer_one_month();
  end if;
end $$;
