# AI Price Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Logovat cenu každého Claude volání (Analyze, Meta Analyze) do nové tabulky `ai_usage_logs`, zobrazit kumulativní útratu Dnes/Měsíc v sidebaru a odhad před kliknutím u tlačítek.

**Architecture:** Nová tabulka + pure pricing modul. Logování non-fatal po úspěšném Claude volání přímo v existujících route handlerech. Čtení přes cached server query, vykreslené v sidebaru. Button badges statické z konstant.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), Claude Sonnet 4 (raw fetch, ne SDK — API routes už to tak mají), React cache().

**Design doc:** `docs/plans/2026-04-09-ai-price-tracking-design.md`

---

## Task 0: Pre-flight check

**Step 1:** Přečti design doc `docs/plans/2026-04-09-ai-price-tracking-design.md`.

**Step 2:** Ověř, že jsi na main a pracovní strom je čistý.

```bash
cd "/Users/jakubzelenka/Downloads/AI hub/LongNight"
git status
git branch --show-current
```
Expected: `main`, working tree clean (nebo očekávané změny od uživatele).

**Step 3:** Ověř, že DB connection funguje. Otevři Supabase dashboard v Chrome MCP (pokud je k dispozici) nebo připrav SQL runner. Poznamenej si URL projektu ze `.env.local` nebo `NEXT_PUBLIC_SUPABASE_URL`.

---

## Task 1: Vytvoř tabulku `ai_usage_logs` (SQL migrace)

**Files:**
- Create: `supabase/migrations/20260409_ai_usage_logs.sql`

**Step 1:** Vytvoř migrační soubor s tímto obsahem:

```sql
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
```

**Step 2:** Spusť SQL v Supabase dashboardu (SQL editor). Potvrď případný "destructive operations" dialog pro DROP POLICY.

**Step 3:** Ověř, že tabulka existuje a RLS je zapnuté:

```sql
select table_name, row_security
from information_schema.tables t
join pg_tables p on p.tablename = t.table_name
where table_name = 'ai_usage_logs';
```

Expected: jeden řádek, row_security = true. (Nebo alternativně ověř přes `\d public.ai_usage_logs` ekvivalent v dashboardu.)

**Step 4:** Commit migrace:

```bash
git add supabase/migrations/20260409_ai_usage_logs.sql
git commit -m "feat(db): add ai_usage_logs table with RLS"
```

---

## Task 2: Vytvoř pricing modul

**Files:**
- Create: `src/lib/ai-pricing.ts`

**Step 1:** Napiš soubor:

```ts
// src/lib/ai-pricing.ts
//
// Cenové konstanty pro Claude Sonnet 4. Volající si cenu počítá
// přes computeCostUsd() — log přetrvá i když se ceník v budoucnu
// změní (cena je vždycky "at time of request").

export const CLAUDE_SONNET_4 = {
  model: "claude-sonnet-4-20250514",
  inputPerMillion: 3,
  outputPerMillion: 15,
} as const;

export function computeCostUsd(
  inputTokens: number,
  outputTokens: number
): number {
  const { inputPerMillion, outputPerMillion } = CLAUDE_SONNET_4;
  return (
    (inputTokens / 1_000_000) * inputPerMillion +
    (outputTokens / 1_000_000) * outputPerMillion
  );
}

// Statické odhady zobrazené u tlačítek. Překalibrovat manuálně
// po ~100 reálných záznamech v ai_usage_logs.
export const AI_ACTION_ESTIMATES = {
  analyze: 0.02, // ~2000 in + 800 out ≈ $0.018
  metaAnalyze: 0.08, // ~5000 in + 4000 out ≈ $0.075
} as const;

export type AiAction = keyof typeof AI_ACTION_ESTIMATES;
```

**Step 2:** TypeScript check:

```bash
cd "/Users/jakubzelenka/Downloads/AI hub/LongNight"
bunx tsc --noEmit 2>&1 | grep -E "(ai-pricing|error)" || echo "no errors"
```
Expected: `no errors` nebo žádná zmínka o `ai-pricing.ts`.

**Step 3:** Commit:

```bash
git add src/lib/ai-pricing.ts
git commit -m "feat(ai): add pricing module with cost helper and estimates"
```

---

## Task 3: Loguj usage v `/api/creatives/analyze`

**Files:**
- Modify: `src/app/api/creatives/analyze/route.ts` (kolem řádků 334–401)

**Step 1:** Na začátek souboru přidej import:

```ts
import { computeCostUsd, CLAUDE_SONNET_4 } from "@/lib/ai-pricing";
```

**Step 2:** Za řádek `const claudeData = await claudeRes.json();` (cca 359), před parsing `analysisText`, přidej non-fatal logging:

```ts
// Non-fatal: log AI usage. Selhání insertu nesmí ovlivnit response.
try {
  const usage = claudeData?.usage ?? {};
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  if (inputTokens > 0 || outputTokens > 0) {
    const costUsd = computeCostUsd(inputTokens, outputTokens);
    const { error: logError } = await supabase.from("ai_usage_logs").insert({
      user_id: user.id,
      shop_id: shopId,
      action: "analyze",
      model: CLAUDE_SONNET_4.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    });
    if (logError) {
      console.error("[analyze-creative] ai_usage_logs insert failed:", logError);
    }
  }
} catch (logErr) {
  console.error("[analyze-creative] ai_usage_logs exception:", logErr);
}
```

**Poznámka:** Předpokládá, že `user` a `shopId` jsou v scope (zkontroluj výš v souboru — pokud ne, najdi jak se jmenují).

**Step 3:** Over, že `user` a `shopId` existují:

```bash
grep -nE "const user|const \{ user|shopId" src/app/api/creatives/analyze/route.ts | head -20
```

Pokud se jmenují jinak, uprav insert odpovídajícím názvem.

**Step 4:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep -E "analyze/route|error" | head -10 || echo "no errors"
```

**Step 5:** Commit:

```bash
git add src/app/api/creatives/analyze/route.ts
git commit -m "feat(ai): log Claude usage in analyze creative route"
```

---

## Task 4: Loguj usage v `/api/creatives/meta-analyze`

**Files:**
- Modify: `src/app/api/creatives/meta-analyze/route.ts` (kolem řádků 284–341)

**Step 1:** Import:

```ts
import { computeCostUsd, CLAUDE_SONNET_4 } from "@/lib/ai-pricing";
```

**Step 2:** Za `const claudeData = await claudeRes.json();` (cca ř. 311) přidej stejný non-fatal logging blok jako v Task 3, ale s `action: "meta_analyze"`:

```ts
try {
  const usage = claudeData?.usage ?? {};
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  if (inputTokens > 0 || outputTokens > 0) {
    const costUsd = computeCostUsd(inputTokens, outputTokens);
    const { error: logError } = await supabase.from("ai_usage_logs").insert({
      user_id: user.id,
      shop_id: shopId,
      action: "meta_analyze",
      model: CLAUDE_SONNET_4.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    });
    if (logError) {
      console.error("[meta-analyze] ai_usage_logs insert failed:", logError);
    }
  }
} catch (logErr) {
  console.error("[meta-analyze] ai_usage_logs exception:", logErr);
}
```

**Step 3:** Ověř názvy `user` / `shopId` v route handleru (grep stejně jako v Task 3).

**Step 4:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep -E "meta-analyze|error" | head -10 || echo "no errors"
```

**Step 5:** Commit:

```bash
git add src/app/api/creatives/meta-analyze/route.ts
git commit -m "feat(ai): log Claude usage in meta-analyze route"
```

---

## Task 5: Přidej `getAiSpend()` do queries

**Files:**
- Modify: `src/lib/supabase/queries.ts`

**Step 1:** Na konec souboru přidej:

```ts
export const getAiSpend = cache(async (): Promise<{
  today: number;
  month: number;
}> => {
  const user = await getCurrentUser();
  if (!user) return { today: 0, month: 0 };

  // Europe/Prague-ish: používáme local time serveru. Funkce běží ve
  // fra1 (viz vercel.json) → Europe/Berlin, stejné offset jako Praha.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select("cost_usd, created_at")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());

  if (error) {
    console.error("[getAiSpend]", error);
    return { today: 0, month: 0 };
  }

  let today = 0;
  let month = 0;
  for (const row of data ?? []) {
    const cost = Number(row.cost_usd ?? 0);
    month += cost;
    if (new Date(row.created_at as string) >= dayStart) today += cost;
  }
  return { today, month };
});
```

**Step 2:** Ověř, že `cache` a `createClient` jsou už importované (měly by být — queries.ts je má).

**Step 3:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep -E "queries|error" | head -10 || echo "no errors"
```

**Step 4:** Commit:

```bash
git add src/lib/supabase/queries.ts
git commit -m "feat(ai): add getAiSpend server query for sidebar"
```

---

## Task 6: Zobraz AI útraty v sidebaru

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Step 1:** V `sidebar.tsx` rozšiř `SidebarProps`:

```ts
interface SidebarProps {
  userEmail: string | null;
  buildTime?: string | null;
  commitSha?: string | null;
  aiSpend?: { today: number; month: number };
}
```

A destructuring:

```ts
export function Sidebar({ userEmail, buildTime, commitSha, aiSpend }: SidebarProps) {
```

**Step 2:** Přidej formátovací helper nad komponentu:

```ts
function formatUsd(n: number): string {
  if (n <= 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
```

**Step 3:** V `bottomContent` nad `{(buildLabel || shortSha) && ...}` vlož blok pro útraty:

```tsx
{aiSpend && (aiSpend.today > 0 || aiSpend.month > 0) && (
  <div className="mt-3 rounded-xl bg-black/[0.03] px-3 py-2.5">
    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#86868b]">
      AI útraty
    </p>
    <div className="mt-1 flex items-baseline gap-3 text-[11px] font-medium text-[#6e6e73]">
      <span>
        Dnes{" "}
        <span className="font-semibold text-[#1d1d1f]">
          {formatUsd(aiSpend.today)}
        </span>
      </span>
      <span className="text-[#d2d2d7]">·</span>
      <span>
        Měsíc{" "}
        <span className="font-semibold text-[#1d1d1f]">
          {formatUsd(aiSpend.month)}
        </span>
      </span>
    </div>
  </div>
)}
```

**Step 4:** V `src/app/dashboard/layout.tsx`:

```ts
import { getCurrentUser, getAiSpend } from "@/lib/supabase/queries";
```

A volání:

```ts
const [user, aiSpend] = await Promise.all([
  getCurrentUser(),
  getAiSpend(),
]);
```

Předej `aiSpend` do `<Sidebar>`:

```tsx
<Sidebar
  userEmail={user.email ?? null}
  buildTime={buildTime}
  commitSha={commitSha}
  aiSpend={aiSpend}
/>
```

**Step 5:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep -E "sidebar|layout|error" | head -10 || echo "no errors"
```

**Step 6:** Commit:

```bash
git add src/components/layout/sidebar.tsx src/app/dashboard/layout.tsx
git commit -m "feat(ui): show AI spend today/month in sidebar footer"
```

---

## Task 7: Badge u tlačítek Analyze / Meta Analyze

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`
- Najdi JSX míst, kde se renderuje `<button>` s textem "Analyze" (nebo český ekvivalent) a `<button>` pro meta analyze.

**Step 1:** Na začátek souboru přidej import:

```ts
import { AI_ACTION_ESTIMATES } from "@/lib/ai-pricing";
```

**Step 2:** Najdi Analyze button. Grep:

```bash
grep -nE "Analyz|analyzeMutation\.mutate|metaSheet" src/app/dashboard/\[shopId\]/creatives/page.tsx | head -20
```

**Step 3:** Vedle textu tlačítka Analyze přidej badge:

```tsx
<span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
  ~${AI_ACTION_ESTIMATES.analyze.toFixed(2)}
</span>
```

Uprav `bg-white/20` podle toho, jestli je tlačítko modré/tmavé (bílý badge) nebo světlé (`bg-black/5 text-[#6e6e73]`).

**Step 4:** Stejně pro Meta Analyze tlačítka (pravděpodobně v toolbaru + v selection baru):

```tsx
<span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
  ~${AI_ACTION_ESTIMATES.metaAnalyze.toFixed(2)}
</span>
```

**Step 5:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep -E "creatives.*page|error" | head -10 || echo "no errors"
```

**Step 6:** Commit:

```bash
git add "src/app/dashboard/[shopId]/creatives/page.tsx"
git commit -m "feat(ui): show estimated cost badges next to Analyze buttons"
```

---

## Task 8: Manuální smoke test

**Step 1:** Spusť dev server:

```bash
cd "/Users/jakubzelenka/Downloads/AI hub/LongNight"
bun run dev
```

**Step 2:** Otevři `http://localhost:3000/dashboard/<shopId>/creatives`.

**Step 3:** Zkontroluj, že vedle tlačítek Analyze a Meta Analyze je malá badge `~$0.02` / `~$0.08`.

**Step 4:** Spusť Analyze na jedné kreativě. Počkej na dokončení (dev console by neměla zobrazit chybu `ai_usage_logs insert failed`).

**Step 5:** V Supabase dashboardu / SQL editoru spusť:

```sql
select action, model, input_tokens, output_tokens, cost_usd, created_at
from ai_usage_logs
order by created_at desc
limit 5;
```

Expected: alespoň jeden řádek s `action = 'analyze'`, `cost_usd` mezi ~$0.01 a ~$0.05.

**Step 6:** Vrať se do appky, přejdi na `/dashboard` (přehled). V sidebaru vidíš blok "AI útraty · Dnes $0.XX · Měsíc $0.XX".

**Step 7:** Spusť Meta Analyze (otevři sheet, potvrď). Ověř nový řádek v `ai_usage_logs` s `action = 'meta_analyze'`.

**Step 8:** Refresh dashboardu → částka "Dnes" v sidebaru narostla.

**Step 9:** Simuluj chybu insertu (dočasně přejmenuj sloupec nebo odeber RLS insert policy) → Analyze stále vrací 200 a analýza se uloží do `meta_ad_creatives`. Vrať změnu zpět.

**Step 10:** Pokud všechno funguje, push:

```bash
git push
```

---

## Done criteria

- [ ] Tabulka `ai_usage_logs` existuje s RLS
- [ ] `src/lib/ai-pricing.ts` definuje model, `computeCostUsd`, `AI_ACTION_ESTIMATES`
- [ ] `/api/creatives/analyze` vkládá řádek po úspěšném Claude volání (non-fatal)
- [ ] `/api/creatives/meta-analyze` dtto
- [ ] `getAiSpend()` v `src/lib/supabase/queries.ts`
- [ ] Sidebar renderuje blok "AI útraty" jen když > 0
- [ ] Tlačítka Analyze / Meta Analyze mají badge s odhadem
- [ ] Smoke test prošel: reálné volání → řádek v DB → částka v sidebaru
- [ ] Všechny commity pushnuty do main
