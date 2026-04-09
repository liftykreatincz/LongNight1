-- ai_usage_logs — per-request Claude API usage tracking
create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete set null,
  action text not null check (action in ('analyze', 'meta_analyze')),
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cost_usd numeric(10, 6) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_created_idx
  on public.ai_usage_logs (user_id, created_at desc);

alter table public.ai_usage_logs enable row level security;

-- Users read only their own rows.
drop policy if exists "ai_usage_logs_select_own" on public.ai_usage_logs;
create policy "ai_usage_logs_select_own" on public.ai_usage_logs
  for select using (auth.uid() = user_id);

-- Insert je povolený z aktuálního user kontextu (API route používá uživatelův SSR client).
drop policy if exists "ai_usage_logs_insert_own" on public.ai_usage_logs;
create policy "ai_usage_logs_insert_own" on public.ai_usage_logs
  for insert with check (auth.uid() = user_id);
