-- Independent Means — Plans table
-- Run this in: Supabase Dashboard → SQL Editor → New Query
--
-- Prerequisites: supabase-subscriptions.sql must have been run first
-- (creates the handle_updated_at() trigger function used below).
--
-- Note: user_id is TEXT not UUID — Clerk user IDs are strings like
-- "user_2NNpzFLS..." and are not present in Supabase's auth.users table.
-- RLS uses auth.jwt() ->> 'sub' which is populated from the Clerk JWT
-- via the "supabase" JWT template configured in the Clerk dashboard.

create table if not exists plans (
  id         uuid        primary key default gen_random_uuid(),
  user_id    text        not null unique,
  data       jsonb       not null default '{}',
  stage      integer     not null default 1 check (stage between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reuse the trigger function created in supabase-subscriptions.sql
create trigger plans_updated_at
  before update on plans
  for each row execute function handle_updated_at();

-- Row Level Security
alter table plans enable row level security;

-- Clerk JWT: auth.jwt() ->> 'sub' is the Clerk user ID
create policy "Users read own plan" on plans
  for select using ((auth.jwt() ->> 'sub') = user_id);

create policy "Users insert own plan" on plans
  for insert with check ((auth.jwt() ->> 'sub') = user_id);

create policy "Users update own plan" on plans
  for update using ((auth.jwt() ->> 'sub') = user_id);

create policy "Users delete own plan" on plans
  for delete using ((auth.jwt() ->> 'sub') = user_id);
