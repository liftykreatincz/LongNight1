# AI Price Tracking — Design

**Date:** 2026-04-09
**Status:** Approved, pending implementation plan

## Problem

Uživatel potřebuje vědět, kolik ho stojí AI požadavky v aplikaci. Dva pohledy:

1. **Před kliknutím** — odhad ceny vedle tlačítek Analyze / Meta Analyze, ať ví do čeho jde.
2. **Po kliknutí, kumulativně** — kolik už dnes a tento měsíc utratil, viditelné v sidebaru.

Měna: **USD**. Model: **Claude Sonnet 4** ($3/M input, $15/M output).

## Approach

**Logging na straně serveru v už existujících API route handlerech.** Po úspěšném Claude volání vložíme záznam do nové tabulky `ai_usage_logs` s tokeny a vypočítanou cenou. Čtení v sidebaru přes jeden range query cachovaný per-request.

Odhady před kliknutím jsou **statické konstanty** v `src/lib/ai-pricing.ts` (ne dynamický výpočet). Odhady můžeme kalibrovat podle reálných dat z logů později.

### Alternativy zvažované
- **B) Derive z Anthropic billing API** — odmítnuto: chybí per-action granularita, zpožděné, vázané na účet.
- **C) Počítat jen tokeny, cenu počítat on-the-fly v UI** — odmítnuto: kdyby se ceny modelu v čase změnily, historie by se přepočítala, což je matoucí. Logujeme cenu "at time of request".

## Data model

Nová tabulka `ai_usage_logs`:

| column | type | notes |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | FK → `auth.users`, RLS scope |
| `shop_id` | uuid nullable | FK → `shops`, pro budoucí per-shop breakdown |
| `action` | text | `'analyze'` \| `'meta_analyze'` \| další |
| `model` | text | `'claude-sonnet-4-...'` |
| `input_tokens` | int | z `response.usage.input_tokens` |
| `output_tokens` | int | z `response.usage.output_tokens` |
| `cost_usd` | numeric(10,6) | vypočítané serverem |
| `created_at` | timestamptz | default `now()` |

**Indexy:** `(user_id, created_at desc)` pro rychlé range query v sidebaru.

**RLS:** `user_id = auth.uid()` pro select. Insert jen přes service role / API route (user nemá přímý insert).

## Pricing module — `src/lib/ai-pricing.ts`

```ts
export const CLAUDE_SONNET_4 = {
  model: "claude-sonnet-4-20250514", // aktuální
  inputPerMillion: 3,
  outputPerMillion: 15,
};

export function computeCostUsd(inputTokens: number, outputTokens: number) {
  const { inputPerMillion, outputPerMillion } = CLAUDE_SONNET_4;
  return (
    (inputTokens / 1_000_000) * inputPerMillion +
    (outputTokens / 1_000_000) * outputPerMillion
  );
}

export const AI_ACTION_ESTIMATES = {
  analyze: 0.02,      // ~2000 in + 800 out ≈ $0.018
  metaAnalyze: 0.08,  // ~5000 in + 4000 out ≈ $0.075
} as const;
```

Hodnoty odhadů budou recalibrované po ~100 reálných záznamech z `ai_usage_logs`.

## Server logging

V `src/app/api/creatives/analyze/route.ts` a `src/app/api/creatives/meta-analyze/route.ts`, **po úspěšném** Claude volání:

```ts
const cost = computeCostUsd(usage.input_tokens, usage.output_tokens);
// Insert je non-fatal — když selže, endpoint stále vrátí 200.
supabase.from("ai_usage_logs").insert({
  user_id: user.id,
  shop_id: shopId,
  action: "analyze",
  model: CLAUDE_SONNET_4.model,
  input_tokens: usage.input_tokens,
  output_tokens: usage.output_tokens,
  cost_usd: cost,
}).then(({ error }) => { if (error) console.error("ai_usage_logs insert", error); });
```

## Čtení — `getAiSpend()` v `src/lib/supabase/queries.ts`

Jeden range query od začátku aktuálního měsíce (local time Europe/Prague), split dnes vs měsíc se udělá v JS:

```ts
export const getAiSpend = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return { today: 0, month: 0 };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_usage_logs")
    .select("cost_usd, created_at")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());

  let today = 0, month = 0;
  for (const row of data ?? []) {
    month += Number(row.cost_usd);
    if (new Date(row.created_at) >= dayStart) today += Number(row.cost_usd);
  }
  return { today, month };
});
```

Cachováno přes React `cache()` → jedno DB volání per request i když sidebar a stránka oboje chtějí data.

## UI

### Sidebar footer
Nad build time řádek:
```
AI útraty
Dnes  $0.12   ·   Měsíc  $3.40
```
Formát: `$X.XX` pro ≥ $0.01, jinak `<$0.01`. Skryj řádek když `today === 0 && month === 0` (nový uživatel).

### Button badges
Vedle Analyze tlačítek malá šedá badge: `~$0.02`, `~$0.08`. Tooltip "Odhadovaná cena za jedno volání (Claude Sonnet 4)".

## Error handling

- Insert do `ai_usage_logs` je **non-fatal** — selhání neovlivní úspěch Claude volání.
- `getAiSpend()` při chybě vrací `{ today: 0, month: 0 }`, nic nerozbije.
- Číselné operace chráněné `Number()` s fallbackem 0.

## Testing

Manuální smoke test:
1. Spusť Analyze na jedné kreativě → zkontroluj nový řádek v `ai_usage_logs`.
2. Přesměruj na dashboard → sidebar ukazuje `Dnes $0.XX`.
3. Spusť Meta Analyze → cena naroste.
4. Simuluj chybu v insertu (dočasně rozbij schema) → Analyze stále vrací 200.

## Out of scope (YAGNI)

- Per-shop breakdown v UI (data máme, ale zobrazení až na žádost).
- Historické grafy útraty.
- Přepočet odhadů na základě reálných dat (manuálně po ~100 záznamech).
- Limity / alerting při překročení.
- Export do CSV.
