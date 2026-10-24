-- Paste into Supabase SQL editor. The server uses a private service-role key;
-- never expose that key to the browser. RLS blocks anonymous direct reads.
create extension if not exists btree_gist;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  service_id text not null check (service_id in ('classic','fade')),
  date date not null,
  time time without time zone not null,
  start_minute integer not null check (start_minute >= 0 and start_minute < 1440),
  end_minute integer not null check (end_minute > start_minute and end_minute <= 1440),
  name text not null,
  email text not null,
  phone text not null,
  notes text not null default '',
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  constraint no_overlapping_confirmed_bookings exclude using gist (
    date with =,
    int4range(start_minute, end_minute, '[)') with &&
  ) where (status = 'confirmed')
);

create index if not exists idx_bookings_date on public.bookings(date);
alter table public.bookings enable row level security;
-- Intentional: no RLS policies. Only the backend's service role can access records.

-- Owner-edited days, hours and days off (durable even after redeploy).
create table if not exists public.studio_settings (
  id integer primary key check (id = 1),
  schedule jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.studio_settings enable row level security;
-- No public RLS policies: the server's private service-role key is required.
