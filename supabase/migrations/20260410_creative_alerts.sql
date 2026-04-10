-- Phase 5C: Smart Alerts
create table if not exists public.creative_alerts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  ad_id text not null,
  alert_type text not null
    check (alert_type in ('fatigue','top_performer','spend_no_results','rising_star')),
  message text not null,
  severity text not null default 'medium'
    check (severity in ('high','medium','low')),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz null
);

create index if not exists creative_alerts_shop_idx
  on public.creative_alerts (shop_id, dismissed_at nulls first, created_at desc);

alter table public.creative_alerts enable row level security;

create policy "Users see own shop alerts"
  on public.creative_alerts for select
  using (shop_id in (select id from public.shops where user_id = auth.uid()));

create policy "Users update own shop alerts"
  on public.creative_alerts for update
  using (shop_id in (select id from public.shops where user_id = auth.uid()));
