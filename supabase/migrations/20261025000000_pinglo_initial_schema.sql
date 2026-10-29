create table if not exists public.pinglo_customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  phone text not null,
  status text not null check (status in ('New', 'Contacted', 'Interested', 'Confirmed', 'Completed')),
  next_follow_up date,
  notes text not null default '',
  created_at date not null default current_date,
  primary key (user_id, id)
);

create table if not exists public.pinglo_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_name text not null,
  business_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pinglo_templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  icon text not null default '',
  message text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.pinglo_customers enable row level security;
alter table public.pinglo_profiles enable row level security;
alter table public.pinglo_templates enable row level security;

drop policy if exists pinglo_customers_user_access on public.pinglo_customers;
create policy pinglo_customers_user_access
  on public.pinglo_customers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists pinglo_profiles_user_access on public.pinglo_profiles;
create policy pinglo_profiles_user_access
  on public.pinglo_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists pinglo_templates_user_access on public.pinglo_templates;
create policy pinglo_templates_user_access
  on public.pinglo_templates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table
  public.pinglo_customers,
  public.pinglo_profiles,
  public.pinglo_templates
to authenticated;
