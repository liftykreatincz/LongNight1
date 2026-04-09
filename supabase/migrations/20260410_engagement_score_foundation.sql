-- 1) Per-shop CPA target (for filter: spend >= 2*cpa_target)
alter table public.shops
  add column if not exists cpa_target_czk numeric(12,2) null;

-- 2) New creative metrics needed for video scoring
alter table public.meta_ad_creatives
  add column if not exists frequency numeric null,
  add column if not exists video_plays integer null,
  add column if not exists video_avg_watch_time numeric null; -- seconds

-- 3) Frozen benchmark thresholds per shop × format × campaign type × metric
create table if not exists public.shop_benchmarks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  format text not null check (format in ('image','video')),
  campaign_type text not null default 'all'
    check (campaign_type in ('all','evergreen','sale')),
  metric text not null,
  fail numeric not null,
  hranice numeric not null,
  good numeric not null,
  top numeric not null,
  sample_size integer not null default 0,
  is_default boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (shop_id, format, campaign_type, metric)
);

create index if not exists shop_benchmarks_lookup_idx
  on public.shop_benchmarks (shop_id, format, campaign_type);

alter table public.shop_benchmarks enable row level security;

create policy "shop_benchmarks_select_own"
  on public.shop_benchmarks for select
  using (exists (
    select 1 from public.shops s
    where s.id = shop_benchmarks.shop_id and s.user_id = auth.uid()
  ));

create policy "shop_benchmarks_insert_own"
  on public.shop_benchmarks for insert
  with check (exists (
    select 1 from public.shops s
    where s.id = shop_benchmarks.shop_id and s.user_id = auth.uid()
  ));

create policy "shop_benchmarks_update_own"
  on public.shop_benchmarks for update
  using (exists (
    select 1 from public.shops s
    where s.id = shop_benchmarks.shop_id and s.user_id = auth.uid()
  ));
