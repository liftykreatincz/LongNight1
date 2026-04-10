-- Phase 4: Creative Fatigue Index
-- Daily insights per creative (30-day window)
create table if not exists public.meta_ad_creative_daily (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  ad_id text not null,
  date date not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  ctr numeric not null default 0,
  cpm numeric not null default 0,
  spend numeric not null default 0,
  frequency numeric not null default 0,
  purchases integer not null default 0,
  link_clicks integer not null default 0,
  constraint meta_ad_creative_daily_unique unique (shop_id, ad_id, date)
);

create index if not exists meta_ad_creative_daily_shop_ad_idx
  on public.meta_ad_creative_daily (shop_id, ad_id, date desc);

alter table public.meta_ad_creative_daily enable row level security;

create policy "Users see own shop daily data"
  on public.meta_ad_creative_daily for select
  using (shop_id in (select id from public.shops where user_id = auth.uid()));

-- Fatigue columns on existing creatives table
alter table public.meta_ad_creatives
  add column if not exists fatigue_score numeric null,
  add column if not exists fatigue_signal text null
    check (fatigue_signal in ('none','rising','fatigued','critical')),
  add column if not exists fatigue_computed_at timestamptz null;
