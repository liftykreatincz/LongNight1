-- Phase 3: rolling window + drift detection + snapshots
alter table public.shops
  add column if not exists benchmark_window_days integer null,
  add column if not exists drift_detected_at timestamptz null;

create table if not exists public.shop_benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  format text not null check (format in ('image','video')),
  campaign_type text not null default 'all'
    check (campaign_type in ('all','evergreen','sale','seasonal')),
  metric text not null,
  fail numeric not null,
  hranice numeric not null,
  good numeric not null,
  top numeric not null,
  sample_size integer not null default 0,
  is_default boolean not null default false,
  computed_at timestamptz not null
);

create index if not exists shop_benchmark_snapshots_shop_time_idx
  on public.shop_benchmark_snapshots (shop_id, snapshot_at desc);

alter table public.shop_benchmark_snapshots enable row level security;

create policy "shop_benchmark_snapshots_select_own"
  on public.shop_benchmark_snapshots for select
  using (exists (select 1 from public.shops s
    where s.id = shop_benchmark_snapshots.shop_id and s.user_id = auth.uid()));

create policy "shop_benchmark_snapshots_insert_own"
  on public.shop_benchmark_snapshots for insert
  with check (exists (select 1 from public.shops s
    where s.id = shop_benchmark_snapshots.shop_id and s.user_id = auth.uid()));

create policy "shop_benchmark_snapshots_delete_own"
  on public.shop_benchmark_snapshots for delete
  using (exists (select 1 from public.shops s
    where s.id = shop_benchmark_snapshots.shop_id and s.user_id = auth.uid()));
