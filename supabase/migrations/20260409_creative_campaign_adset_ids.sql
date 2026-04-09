alter table public.meta_ad_creatives
  add column if not exists campaign_id text,
  add column if not exists adset_id text;

create index if not exists meta_ad_creatives_shop_campaign_idx
  on public.meta_ad_creatives (shop_id, campaign_id);
create index if not exists meta_ad_creatives_shop_adset_idx
  on public.meta_ad_creatives (shop_id, adset_id);
