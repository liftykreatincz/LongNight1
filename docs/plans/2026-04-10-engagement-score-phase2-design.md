# Engagement Score Fáze 2 — Design Document

**Datum:** 2026-04-10
**Status:** Approved, ready for implementation plan
**Navazuje na:** `2026-04-09-engagement-score-design.md` (Fáze 1)

---

## 1. Cíl

Rozšířit Engagement Score metodiku o:

1. **Segmentaci kreativ** podle typu kampaně — `evergreen` / `sale` / `seasonal` / `unknown`, aby benchmarky neztrácely signál mícháním slevových a evergreen dat.
2. **Skutečnou délku videa** z Meta Graph API, která nahradí hrubý proxy výpočet `avg_watch_pct = video_avg_watch_time / 15 * 100` z Fáze 1.

**Non-cíle** (mimo Fázi 2):
- AM approval flow, drift alerty (Fáze 3)
- Weekly snapshots + Fatigue Index (Fáze 4)
- Diagnostická matice UI + action framework panel (Fáze 5)
- CSV onboarding import, e-mail alerty

---

## 2. Architektura — high-level flow

```
Meta Graph API sync
  ├─ GET /campaigns                 → parser → campaign_type (auto)
  ├─ GET /videos (per video ad)     → length → video_duration_seconds
  └─ GET /ads                       → standard fields (beze změny)

Manual override (tree view popover)
  └─ UPDATE meta_ad_campaigns.campaign_type (source='manual')
     → invalidate TanStack queries

Scoring pipeline
  ├─ Load creative row (JOIN meta_ad_campaigns pro campaign_type)
  ├─ Load benchmarks for (shop, format, campaign_type)
  ├─ If sample_size < 15 → fallback to (shop, format, 'all')
  └─ scoreCreative(input, benchmarks, cpaTarget) → EngagementResult
     (nyní včetně usedFallback + fallbackReason)
```

---

## 3. DB schema změny

Nová migrace `supabase/migrations/<timestamp>_engagement_score_phase2.sql`:

```sql
-- 1) Campaign type na kampaních
alter table public.meta_ad_campaigns
  add column if not exists campaign_type text not null default 'unknown'
    check (campaign_type in ('unknown','evergreen','sale','seasonal')),
  add column if not exists campaign_type_source text not null default 'auto'
    check (campaign_type_source in ('auto','manual')),
  add column if not exists campaign_type_classified_at timestamptz null;

create index if not exists meta_ad_campaigns_type_idx
  on public.meta_ad_campaigns (shop_id, campaign_type);

-- 2) Video duration na kreativách
alter table public.meta_ad_creatives
  add column if not exists video_duration_seconds numeric null;

-- 3) Rozšíření shop_benchmarks constraint o 'seasonal'
alter table public.shop_benchmarks
  drop constraint if exists shop_benchmarks_campaign_type_check;

alter table public.shop_benchmarks
  add constraint shop_benchmarks_campaign_type_check
    check (campaign_type in ('all','evergreen','sale','seasonal'));
```

**Klíčová rozhodnutí:**

- **Default `unknown`** — nové sloupce jsou NOT NULL s defaultem, takže existující řádky ihned získají hodnotu. Při první klasifikaci (ruční Synchronizovat nebo Reklasifikovat) se `unknown` přepíše na skutečný typ.
- **`campaign_type_source`** rozlišuje auto vs manual. Auto parser **nikdy nepřepíše manual** řádek.
- **`classified_at`** pro diagnostiku + UI "Naposledy klasifikováno".
- **`video_duration_seconds` nullable** — graceful degradation, fallback na `/ 15` proxy pro existující video kreativy dokud je uživatel znovu nesynčne.
- **Žádná destrukce** — všechno jsou `add column`, žádný drop, žádný data migrate.
- **RLS** — `meta_ad_campaigns` a `meta_ad_creatives` už mají RLS z dřívějška, žádná změna.

---

## 4. Campaign classifier library

Nová složka `src/lib/campaign-classifier/`:

```
campaign-classifier/
├── types.ts           — CampaignType = 'evergreen'|'sale'|'seasonal'|'unknown'
├── keywords.ts        — SALE_KEYWORDS, SEASONAL_KEYWORDS, DISCOUNT_REGEX
├── classify-name.ts   — classifyByName(name): CampaignType | null
├── classify-date.ts   — classifyByDateRange(start, stop): CampaignType | null
├── classify.ts        — classifyCampaign(input): ClassificationResult
├── index.ts           — barrel exports
└── *.test.ts          — TDD unit testy
```

### 4.1 Keywords (`keywords.ts`)

```ts
export const SALE_KEYWORDS = [
  "SALE", "SLEVA", "AKCE", "DISCOUNT",
  "VÝPRODEJ", "VYPRODEJ", "DEAL"
];

export const SEASONAL_KEYWORDS = [
  "BF", "BLACKFRIDAY", "BLACK_FRIDAY", "BLACK-FRIDAY",
  "CYBERMONDAY", "CYBER_MONDAY",
  "XMAS", "VANOCE", "VÁNOCE", "CHRISTMAS",
  "VALENTYN", "VALENTINE", "DENMATEK", "DEN_MATEK",
  "VELIKONOCE", "EASTER", "HALLOWEEN",
  "NEWYEAR", "NEW_YEAR", "SILVESTR"
];

export const DISCOUNT_REGEX = /-\d{1,2}\s?%/;
```

### 4.2 Naming parser (`classify-name.ts`)

```ts
export function classifyByName(name: string): CampaignType | null {
  const upper = name.toUpperCase().replace(/\s+/g, "_");
  // Seasonal má prioritu — "BF_SALE_2025" = seasonal
  if (SEASONAL_KEYWORDS.some(k => upper.includes(k))) return "seasonal";
  if (SALE_KEYWORDS.some(k => upper.includes(k)) || DISCOUNT_REGEX.test(name)) return "sale";
  return null;
}
```

### 4.3 Date-range fallback (`classify-date.ts`)

```ts
export function classifyByDateRange(
  startedAt?: Date | null,
  endedAt?: Date | null
): CampaignType | null {
  if (!startedAt) return null;
  const end = endedAt ?? new Date();
  const days = Math.round((end.getTime() - startedAt.getTime()) / 86_400_000);

  // Seasonal: kampaň v listopad-prosinec a max 45 dní
  const startMonth = startedAt.getUTCMonth(); // 0-based
  const endMonth = end.getUTCMonth();
  if ((startMonth === 10 || startMonth === 11) && days <= 45) return "seasonal";

  // Sale: kampaň žila max 14 dní a už skončila
  if (endedAt && days <= 14) return "sale";

  return null;
}
```

### 4.4 Orchestrátor (`classify.ts`)

```ts
export type ClassificationSource = "auto" | "manual";
export type ClassificationMatchedBy = "name" | "date" | "default";

export interface ClassificationResult {
  type: CampaignType;
  source: ClassificationSource;
  matchedBy: ClassificationMatchedBy;
}

export function classifyCampaign(input: {
  name: string;
  started_at?: Date | null;
  ended_at?: Date | null;
}): ClassificationResult {
  const byName = classifyByName(input.name);
  if (byName) return { type: byName, source: "auto", matchedBy: "name" };

  const byDate = classifyByDateRange(input.started_at, input.ended_at);
  if (byDate) return { type: byDate, source: "auto", matchedBy: "date" };

  // Default — většina kampaní je evergreen, minimalizuje UI banner šum
  return { type: "evergreen", source: "auto", matchedBy: "default" };
}
```

**Poznámka:** Parser vrací `evergreen` jako default místo `unknown`. `unknown` v DB existuje jen pro kampaně, které ještě neprošly klasifikací (nová migrace default). Po prvním Sync všechny dostanou aspoň `evergreen`.

### 4.5 Testy

- `classify-name.test.ts` — 15+ cases: SALE prefix, BF suffix, mezera/podtržítko, case-insensitive, -30% regex, prázdný string, kombinace.
- `classify-date.test.ts` — edge cases: null dates, current-day (active), < 14 day sale, > 45 day not seasonal, leden mimo BF window, leap year.
- `classify.test.ts` — priorita: name > date > default; seasonal > sale.

---

## 5. Meta sync integrace

### 5.1 Campaign classifier call

V `src/lib/meta-sync.ts` (nebo kde se campaigns fetchujou z Graph API) po fetch každé kampaně:

```ts
// Po fetch GET /act_{adAccountId}/campaigns
for (const campaign of campaigns) {
  const existing = await db.select().from("meta_ad_campaigns").where({ id: campaign.id });

  // Nikdy nepřepisuj manual override
  if (existing?.campaign_type_source === "manual") continue;

  const result = classifyCampaign({
    name: campaign.name,
    started_at: campaign.start_time ? new Date(campaign.start_time) : null,
    ended_at: campaign.stop_time ? new Date(campaign.stop_time) : null,
  });

  await db.upsert("meta_ad_campaigns", {
    ...campaign,
    campaign_type: result.type,
    campaign_type_source: "auto",
    campaign_type_classified_at: new Date(),
  });
}
```

### 5.2 Video duration fetch

Pro každou kreativu, která má `creative_type === 'video'` a ještě nemá `video_duration_seconds`:

```ts
// 1) Fetch creative → získat video_id
const creative = await fetch(
  `https://graph.facebook.com/v21.0/${adCreativeId}?fields=video_id&access_token=${token}`
);
if (!creative.video_id) continue;

// 2) Fetch video → získat length
const video = await fetch(
  `https://graph.facebook.com/v21.0/${creative.video_id}?fields=length&access_token=${token}`
);
const length = Number(video.length);
if (!Number.isFinite(length) || length <= 0) continue;

// 3) Update creative
await db.update("meta_ad_creatives", { video_duration_seconds: length }).where({ id: adCreativeId });
```

**Error handling:**
- API selže → log warn, `video_duration_seconds` zůstává `null`, score fallbackuje na proxy `/ 15`
- Rate limiting → respektovat existující retry/backoff v meta-sync
- Non-fatal: sync nikdy nespadne kvůli chybějící délce videa

**Cost:** +2 API calls per video kreativa. Shop se 100 videi = +200 volání, ~3-5 s navíc při sync.

---

## 6. Scoring pipeline + benchmarks fallback

### 6.1 `computeBenchmarks` rozšíření

`src/lib/engagement-score/compute-benchmarks.ts` — dnes počítá jeden set per `(shop, format, 'all')`. Rozšíříme:

```ts
const SEGMENTS: CampaignType[] = ["evergreen", "sale", "seasonal"];
const FORMATS: CreativeFormat[] = ["image", "video"];

for (const format of FORMATS) {
  // 1) 'all' benchmark vždy — slouží jako fallback
  const allRows = creatives.filter(c => c.format === format).filter(hasEnoughData);
  if (allRows.length >= 15) {
    upsertBenchmarks({ format, campaign_type: "all", rows: allRows });
  }

  // 2) Per-segment benchmarks
  for (const segment of SEGMENTS) {
    const segRows = allRows.filter(c => c.campaign_type === segment);
    if (segRows.length < 15) {
      // Neskladuj segment — fallback logika v resolveBenchmarks
      continue;
    }
    upsertBenchmarks({ format, campaign_type: segment, rows: segRows });
  }
}
```

### 6.2 Lookup + fallback

Nový helper `src/lib/engagement-score/resolve-benchmarks.ts`:

```ts
export interface ResolvedBenchmarks {
  set: BenchmarkSet;
  usedFallback: boolean;
  fallbackReason: string | null;
  effectiveCampaignType: CampaignType | "all";
}

export function resolveBenchmarks(
  benchmarks: Map<string, BenchmarkSet>, // key: `${format}:${campaign_type}`
  format: CreativeFormat,
  campaignType: CampaignType
): ResolvedBenchmarks {
  const primaryKey = `${format}:${campaignType}`;
  const primary = benchmarks.get(primaryKey);
  if (primary && primary.sample_size >= 15) {
    return {
      set: primary,
      usedFallback: false,
      fallbackReason: null,
      effectiveCampaignType: campaignType,
    };
  }

  const fallback = benchmarks.get(`${format}:all`);
  if (fallback) {
    return {
      set: fallback,
      usedFallback: true,
      fallbackReason: campaignType === "unknown"
        ? "Kampaň není klasifikovaná"
        : `Málo dat v segmentu ${campaignType} (n=${primary?.sample_size ?? 0})`,
      effectiveCampaignType: "all",
    };
  }

  // Worst case — prázdný shop, žádná data
  return {
    set: DEFAULT_AGENCY_BENCHMARKS[format],
    usedFallback: true,
    fallbackReason: "Výchozí agenturní benchmark",
    effectiveCampaignType: "all",
  };
}
```

### 6.3 `scoreCreative` API změna

`scoreCreative` dnes bere `benchmarks: BenchmarkSet` (single). Rozšíříme:

```ts
export function scoreCreative(
  input: ScoreInput,
  benchmarksMap: Map<string, BenchmarkSet>,
  cpaTarget: number
): EngagementResult {
  const resolved = resolveBenchmarks(benchmarksMap, input.creativeType, input.campaignType);
  // ... existující scoring pipeline proti resolved.set ...

  return {
    // ... existující pole ...
    usedFallback: resolved.usedFallback,
    fallbackReason: resolved.fallbackReason,
    effectiveCampaignType: resolved.effectiveCampaignType,
  };
}
```

### 6.4 `avg_watch_pct` recalculation

V `score.ts`:

```ts
const avgWatchPct = input.video_duration_seconds && input.video_duration_seconds > 0
  ? (input.video_avg_watch_time / input.video_duration_seconds) * 100
  : (input.video_avg_watch_time / 15) * 100; // fallback proxy (Fáze 1)
```

### 6.5 `ScoreInput` rozšíření

`src/lib/engagement-score/types.ts`:

```ts
export interface ScoreInput {
  // ... existující pole ...
  campaignType: CampaignType;           // NOVÉ
  video_duration_seconds: number | null; // NOVÉ
}
```

### 6.6 `row-adapter` update

`src/lib/engagement-score/row-adapter.ts` — `creativeRowToScoreInput` musí z JOIN řádku vytáhnout `campaign_type` a `video_duration_seconds`.

### 6.7 Testy

- `compute-benchmarks.test.ts` — segregace per segment, preskočení při < 15, `all` vždy vypočítán
- `resolve-benchmarks.test.ts` — primary hit → fallback `all` → default agentury
- `score.test.ts` — `usedFallback` output, `video_duration_seconds` recalculation, fallback na proxy při `null`

---

## 7. Hooks update

### 7.1 `useShopBenchmarks`

`src/hooks/useShopBenchmarks.ts` — dnes vrací `BenchmarkSet | null`. Změníme na:

```ts
interface UseShopBenchmarksResult {
  map: Map<string, BenchmarkSet> | null;
  isLoading: boolean;
  error: Error | null;
}
```

Query fetchuje všechny řádky `shop_benchmarks` pro shop, indexuje podle `${format}:${campaign_type}`.

### 7.2 `useCreativeAnalysis`

`src/hooks/useCreativeAnalysis.ts` — rozšířit interface `CreativeRow`:

```ts
export interface CreativeRow {
  // ... existující pole ...
  campaignType: CampaignType;         // JOIN z meta_ad_campaigns
  campaignTypeSource: "auto"|"manual";
  videoDurationSeconds: number | null;
}
```

Query mění JOIN aby tahal nové sloupce.

---

## 8. UI komponenty

### 8.1 `<CampaignTypeBadge>` (`src/components/creatives/campaign-type-badge.tsx`)

Pill-shaped badge s barvami a ikonou:

| Type | Color | Icon |
|---|---|---|
| `evergreen` | `#0071e3` (modrá) | `Leaf` |
| `sale` | `#ff9f0a` (oranžová) | `Tag` |
| `seasonal` | `#bf5af2` (fialová) | `Snowflake` |
| `unknown` | `#86868b` (šedá, blikající dotted border) | `HelpCircle` |

Props: `type`, `source`, `onClick?`. Clickable varianta otevře `<CampaignTypePopover>`.

### 8.2 `<CampaignTypePopover>`

Radio group: Evergreen / Sale / Seasonal / Neklasifikováno.
Info řádek: "Auto-klasifikováno podle názvu" / "Auto-klasifikováno podle data" / "Nastaveno manuálně 10.4.2026".

Save → `UPDATE meta_ad_campaigns SET campaign_type=?, campaign_type_source='manual', campaign_type_classified_at=now()`.

Invalidate TanStack queries:
- `["creatives", shopId]`
- `["shop-benchmarks", shopId]`
- `["unclassified-campaigns", shopId]`

### 8.3 Tree view update

`creatives-tree-view.tsx` — `CampaignRow` dostane `campaignType` + `campaignTypeSource` props a renderuje `<CampaignTypeBadge>` vedle jména kampaně. Neklasifikované kampaně mají dodatečný visual cue (blikající dot).

### 8.4 Filter chips na `/creatives` page

Nová řada chips vedle formát filtru:
`Vše / Evergreen / Sale / Seasonal / Neklasifikováno`

- State v URL query param `?campaign_type=sale` (shareable).
- Filtruje `scored` derived state.
- Summary tiles + engagement score tile se přepočítají pro filtrovaný set.

### 8.5 CPA target popover — info řádek

Pod existující popover přidat:

```
Benchmarky: sale (n=42), video
```

Nebo při fallback:

```
Benchmarky: sale → všechny (málo dat, n=8)
```

### 8.6 Unclassified banner

Žlutý banner (stejný styl jako Fáze 1 CPA fallback):

```
⚠️ 12 kampaní není klasifikováno. [Klasifikovat]
```

Klik na "Klasifikovat" → scrollne do tree view a smooth-highlight neklasifikovaných kampaní 2 sekundy.

**Data source:** query `["unclassified-campaigns", shopId]` → COUNT(*) kampaní s `campaign_type = 'unknown'`.

### 8.7 EngagementBadge tooltip update

Přidat řádek do tooltip:

```
Typ: sale
Benchmark: fallback → all (málo dat)
```

Zdroj: `result.effectiveCampaignType`, `result.fallbackReason`.

### 8.8 Settings page — NE pro Fázi 2

Keywords zůstanou v kódu (`keywords.ts`). UI editor pro keywords = YAGNI pro Fázi 2. Pokud se později ukáže potřeba, přidá se jako Fáze 2.5.

---

## 9. API endpoint — manual reclassify

**Volitelné pro Fázi 2:** `POST /api/campaigns/reclassify` — přepočítá klasifikaci všech auto kampaní v shopu. Manual kampaně zůstanou beze změny.

Zavoláno z UI tlačítka "Reklasifikovat kampaně" (umístěné vedle "Přepočítat benchmarky" na `/creatives` stránce).

Implementace:
```ts
// 1) SELECT kampaně WHERE shop_id = ? AND campaign_type_source = 'auto'
// 2) Pro každou zavolat classifyCampaign()
// 3) UPDATE campaign_type, campaign_type_classified_at
// 4) Vrátit { updated: number }
```

---

## 10. Performance

- **Classifier** — pure function, < 1 ms per kampaň. Pro 500 kampaní < 0.5 s.
- **Benchmark recompute** — 4× více výpočtů (all + 3 segmenty × 2 formáty = 8 sets). Pro běžný shop < 1.5 s.
- **Video duration fetch** — +2 API calls per video kreativa. Blokuje sync o 3-5 s pro 100 videí. Acceptable.
- **Tree view badges** — žádné nové queries, data přichází z rozšířeného JOIN v `useCreativeAnalysis`.
- **Score computation** — `resolveBenchmarks` je O(1) Map lookup. Recompute celé `scored` useMemo pro 500 kreativ < 50 ms.

---

## 11. Error handling summary

| Failure | Behavior |
|---|---|
| Classifier throw (invalid input) | Default na `evergreen`, log warn |
| Video length API 4xx/5xx | `video_duration_seconds = null`, fallback na proxy |
| Benchmark segment < 15 vzorků | Automatický fallback na `all`, UI info |
| Benchmark `all` < 15 vzorků | Fallback na DEFAULT_AGENCY_BENCHMARKS |
| Manual override + auto sync | Manual vždy vítězí, auto se přeskočí |
| Kampaň smazaná v Metě ale existuje v naší DB | Zachováme (historical data), klasifikace zůstává |

---

## 12. Testing strategy

**Unit testy (vitest, TDD):**
- `campaign-classifier/classify-name.test.ts` — 15+ cases
- `campaign-classifier/classify-date.test.ts` — edge cases
- `campaign-classifier/classify.test.ts` — priorita + kombinace
- `engagement-score/compute-benchmarks.test.ts` — aktualizace pro segregaci
- `engagement-score/resolve-benchmarks.test.ts` — NEW file, fallback chain
- `engagement-score/score.test.ts` — `usedFallback`, `video_duration_seconds`

**Integration smoke test** (manuální po deploy, jako ve Fázi 1):
1. Sync → ověřit že kampaně dostaly auto klasifikaci
2. Tree view → vidět badges + unclassified banner (pokud nějaké jsou)
3. Klik na badge → popover → změna na manual → skóre se přepočítá
4. Filter chip `sale` → vidět jen sale kreativy, summary tiles se filtrují
5. CPA popover info → vidět jaký benchmark se používá
6. Video kreativa s `video_duration_seconds` fetched → `avg_watch_pct` je realistický
7. Video bez durace → fallback na proxy, bez crashe

---

## 13. Migration strategy

1. **DB migrace** nasadit přes SQL Editor v Supabase (jak ve Fázi 1, uživatel odsouhlasí).
2. **Po nasazení kódu** — existující kampaně mají `unknown`. User pustí Sync nebo zavolá `/api/campaigns/reclassify` → všechny dostanou `evergreen`/`sale`/`seasonal`.
3. **Benchmark recompute** — user pustí "Přepočítat benchmarky" → segregované benchmarky se spočítají.
4. **Video duration** — user pustí Sync → videa postupně dostanou skutečnou délku. Bez průšvihu dokud `null`.
5. **Zero downtime** — všechny změny jsou additive, žádná existující funkčnost se nerozbije.

---

## 14. Open items pro Fázi 3+

- Editor keywords v UI (pokud user požádá)
- Bulk reklasifikace v samostatné `/dashboard/[shopId]/campaigns` stránce (pokud jich bude > 50)
- Detekce duplicitních keywords v uživatelských listech
- Heuristika pro `seasonal` podle kalendářních svátků daného regionu (US vs CZ)

---

## 15. Dependencies

- Supabase PostgreSQL — nové sloupce, constraints
- Meta Graph API v21 — `videos?fields=length` endpoint
- Žádné nové npm balíčky
- TanStack Query v5 — použito pro invalidace (už existuje)
- Tailwind + shadcn/ui — pro nové komponenty (už existuje)

---

**Schváleno:** uživatel 2026-04-10 během brainstorming session
**Další krok:** writing-plans skill → implementační plán s bite-sized úkoly
