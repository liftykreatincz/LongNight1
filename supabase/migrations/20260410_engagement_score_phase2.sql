-- Engagement Score Phase 2: campaign segmentation + real video duration

-- 1) Campaign type on campaigns
alter table public.meta_ad_campaigns
  add column if not exists campaign_type text not null default 'unknown'
    check (campaign_type in ('unknown','evergreen','sale','seasonal')),
  add column if not exists campaign_type_source text not null default 'auto'
    check (campaign_type_source in ('auto','manual')),
  add column if not exists campaign_type_classified_at timestamptz null;

create index if not exists meta_ad_campaigns_type_idx
  on public.meta_ad_campaigns (shop_id, campaign_type);

-- 2) Video duration on creatives
alter table public.meta_ad_creatives
  add column if not exists video_duration_seconds numeric null;

-- 3) Extend shop_benchmarks constraint to allow 'seasonal'
alter table public.shop_benchmarks
  drop constraint if exists shop_benchmarks_campaign_type_check;

alter table public.shop_benchmarks
  add constraint shop_benchmarks_campaign_type_check
    check (campaign_type in ('all','evergreen','sale','seasonal'));
