-- Create meta_ad_campaigns table (was missing from schema)
-- Phase 2 of Engagement Score relies on this table for campaign_type
-- classification (evergreen/sale/seasonal/unknown).

create table if not exists public.meta_ad_campaigns (
  id text primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null default '',
  status text null,
  start_time timestamptz null,
  stop_time timestamptz null,
  campaign_type text not null default 'unknown'
    check (campaign_type in ('unknown','evergreen','sale','seasonal')),
  campaign_type_source text not null default 'auto'
    check (campaign_type_source in ('auto','manual')),
  campaign_type_classified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_ad_campaigns_shop_idx
  on public.meta_ad_campaigns (shop_id);

create index if not exists meta_ad_campaigns_type_idx
  on public.meta_ad_campaigns (shop_id, campaign_type);

alter table public.meta_ad_campaigns enable row level security;

create policy "meta_ad_campaigns_select_own"
  on public.meta_ad_campaigns for select
  using (exists (
    select 1 from public.shops s
    where s.id = meta_ad_campaigns.shop_id and s.user_id = auth.uid()
  ));

create policy "meta_ad_campaigns_insert_own"
  on public.meta_ad_campaigns for insert
  with check (exists (
    select 1 from public.shops s
    where s.id = meta_ad_campaigns.shop_id and s.user_id = auth.uid()
  ));

create policy "meta_ad_campaigns_update_own"
  on public.meta_ad_campaigns for update
  using (exists (
    select 1 from public.shops s
    where s.id = meta_ad_campaigns.shop_id and s.user_id = auth.uid()
  ));

create policy "meta_ad_campaigns_delete_own"
  on public.meta_ad_campaigns for delete
  using (exists (
    select 1 from public.shops s
    where s.id = meta_ad_campaigns.shop_id and s.user_id = auth.uid()
  ));
