# Engagement Score — Fáze 1 (MVP) — Design

**Status:** Schváleno 2026-04-09
**Zdroj metodiky:** `Engagement_Score_Metodika_v2 (2).docx` (verze 2.0, březen 2026)
**Autor:** Jakub + Claude (brainstorming session)

---

## 1. Scope a cíl

Fáze 1 doručí matematicky korektní **Engagement Score 0–100** per kreativa, s kategoriovým rozpadem (Attention / Retention / Efficiency / Performance), akčním labelem (⭐/✅/⚠️/❌) a vizuálem ve všech 3 view módech creatives page (grid/table/tree).

**Klíčové principy:**

- **Benchmarky jsou per-shop, zamrazené v DB** — spočítané z historických dat shopu s fallbackem na agenturní defaulty. Tohle adresuje „benchmark drift problem": pokud bychom počítali percentily live při každém renderu, score kreativy A by se hýbalo čistě tím, že přibyly jiné kreativy do datasetu. Metodika sekce 5 explicitně chce periodický přepočet (30 dní + AM schválení), ne live.
- **Score samotné se v DB neukládá** — je to deterministická pure funkce nad uloženými metrikami + zamrazenými benchmarky + CPA target. Změna vzorce = deploy kódu, žádný reprocessing tisíců historických řádků.
- **Klient-side scoring helper** — stejný pattern jako `creative-aggregation.ts` z tree view feature: pure moduly, TDD vitest testy, volané přes `useMemo` z React komponent.

**Fáze 2–5 jsou mimo tento dokument** (segmentace evergreen/sale, AM approval flow, rolling window config, weekly snapshots, fatigue index, diagnostická matice UI, action framework panel).

---

## 2. Data model — migrace `20260410_engagement_score_foundation.sql`

```sql
-- 1) Per-shop CPA target
alter table public.shops
  add column if not exists cpa_target_czk numeric(12,2) null;

-- 2) Nové metriky potřebné pro scoring
alter table public.meta_ad_creatives
  add column if not exists frequency numeric null,
  add column if not exists video_plays integer null,
  add column if not exists video_avg_watch_time numeric null; -- sekundy

-- 3) Benchmark thresholdy per shop × formát × typ kampaně × metrika
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
```

**Platné `metric` hodnoty (enum v aplikační vrstvě, nevalidováno v DB aby bylo přidávání pružné):**

`ctr_link`, `ctr_all`, `hook_rate`, `thumb_stop`, `avg_watch_pct`, `thruplay_rate`, `hold_rate`, `cpa`, `pno`, `cpm`, `cvr`, `konv_per_1k`

**Poznámky:**

- `campaign_type='all'` je jediná hodnota používaná ve Fázi 1. Fáze 2 rozšíří na `evergreen` a `sale`.
- `is_default=true` znamená řádek vznikl fallbackem (agenturní defaulty) protože `sample_size < 15`. Frontend může podle toho zobrazit „používá se výchozí benchmark".

---

## 3. Meta Graph API rozšíření (`src/app/api/creatives/sync/route.ts`)

Přidat do fields query:

- `frequency` — Meta ji vrací nativně, jen namapovat do `frequency` sloupce.
- `video_play_actions` → aggregate z `action_type='video_play'` → `video_plays`.
- `video_avg_time_watched_actions` → brát `value` z `action_type='video_view'` → `video_avg_watch_time` (v sekundách).

**Format classification:**

Scoring vzorce rozlišují 2 rodiny (metodika 7.1 vs 7.2):

- `image & carousel` — bez Retention kategorie
- `UGC & video` — s Retention kategorií

V LongNight `meta_ad_creatives.creative_type` je už `"image"` | `"video"`. Pro scoring mapujeme:

- `creative_type === 'video'` → format `'video'`
- vše ostatní (image, carousel) → format `'image'`

UGC vs non-UGC video nerozlišujeme — obojí padá do `'video'` bucketu.

---

## 4. `src/lib/engagement-score/` — pure TypeScript moduly

```
src/lib/engagement-score/
├── types.ts              // Všechny typy (Format, MetricKey, Thresholds, ...)
├── defaults.ts           // Agenturní fallback thresholdy
├── filter.ts             // hasEnoughData(creative, cpaTarget)
├── compute-benchmarks.ts // percentile helper ze seznamu kreativ
├── normalize.ts          // lineární interpolace thresholds → 0-100
├── score.ts              // scoreCreative(creative, benchmarks, cpaTarget)
├── action.ts             // actionLabelFromScore
├── index.ts              // public re-exports
└── *.test.ts             // vitest pro každý modul
```

### 4.1 Typy

```ts
export type Format = 'image' | 'video';

export type MetricKey =
  | 'ctr_link' | 'ctr_all' | 'hook_rate' | 'thumb_stop'
  | 'avg_watch_pct' | 'thruplay_rate' | 'hold_rate'
  | 'cpa' | 'pno' | 'cpm' | 'cvr' | 'konv_per_1k';

export interface Thresholds {
  fail: number;
  hranice: number;
  good: number;
  top: number;
}

export type Benchmarks = Record<Format, Partial<Record<MetricKey, Thresholds>>>;

export interface CategoryScores {
  attention: number | null;
  retention: number | null;   // null pro image (category se nepoužívá)
  efficiency: number | null;
  performance: number | null;
}

export type ActionLabel =
  | 'excellent'   // 81-100
  | 'good'        // 61-80
  | 'average'     // 31-60
  | 'weak'        // 0-30
  | 'insufficient_data';

export type FilterReason = 'low_spend' | 'low_clicks' | null;

export interface EngagementResult {
  engagementScore: number | null;   // null ⇔ actionLabel === 'insufficient_data'
  categories: CategoryScores;
  actionLabel: ActionLabel;
  filterReason: FilterReason;
  format: Format;
}
```

### 4.2 Filtr pro zařazení (`filter.ts`)

Podle metodiky sekce 2:

```ts
function hasEnoughData(
  creative: CreativeRow,
  cpaTarget: number,
): { ok: boolean; reason: FilterReason } {
  const spendOk = creative.spend >= 2 * cpaTarget;
  const clicksOk = creative.linkClicks >= 50;
  const purchasesOverride = creative.purchases >= 3;

  if (purchasesOverride) return { ok: true, reason: null };
  if (!spendOk) return { ok: false, reason: 'low_spend' };
  if (!clicksOk) return { ok: false, reason: 'low_clicks' };
  return { ok: true, reason: null };
}
```

### 4.3 Normalizace (`normalize.ts`)

Lineární interpolace mezi benchmarkovými body. Vzorec pro non-invertované metriky (vyšší = lepší) a invertované (nižší = lepší, CPA/PNO/CPM) z metodiky sekce 6:

```ts
function normalize(value: number, t: Thresholds, inverted: boolean): number {
  if (inverted) {
    if (value <= t.top) return 100;
    if (value <= t.good) return 75 + ((t.good - value) / (t.good - t.top)) * 25;
    if (value <= t.hranice) return 40 + ((t.hranice - value) / (t.hranice - t.good)) * 35;
    if (value <= t.fail) return 10 + ((t.fail - value) / (t.fail - t.hranice)) * 30;
    return 10;
  } else {
    if (value >= t.top) return 100;
    if (value >= t.good) return 75 + ((value - t.good) / (t.top - t.good)) * 25;
    if (value >= t.hranice) return 40 + ((value - t.hranice) / (t.good - t.hranice)) * 35;
    if (value >= t.fail) return 10 + ((value - t.fail) / (t.hranice - t.fail)) * 30;
    return 10;
  }
}
```

Příklad z metodiky (sekce 6): CTR 2.1 % při benchmarcích FAIL=1.0, HRANICE=1.8, GOOD=2.5, TOP=3.5 → leží mezi HRANICE a GOOD → `40 + (2.1 - 1.8) / (2.5 - 1.8) * 35 = 40 + 15 = 55`. Toto bude první unit test.

**Invertované metriky**: `cpa`, `pno`, `cpm`. Všechny ostatní non-inverted.

### 4.4 Scoring (`score.ts`)

Pro `image` (metodika 7.1):

```
score_attention   = avg(norm_ctr_link, norm_ctr_all)
score_efficiency  = avg(norm_inv_cpa, norm_inv_pno, norm_inv_cpm)
score_performance = avg(norm_cvr, norm_konv_per_1k)
score_retention   = null
engagement_score  = round(0.30*A + 0.30*E + 0.40*P, 1)
```

Pro `video` (metodika 7.2):

```
score_attention   = avg(norm_ctr_link, norm_hook_rate, norm_thumb_stop)
score_retention   = avg(norm_avg_watch_pct, norm_thruplay_rate, norm_hold_rate)
score_efficiency  = avg(norm_inv_cpa, norm_inv_pno, norm_inv_cpm)
score_performance = avg(norm_cvr, norm_konv_per_1k)
engagement_score  = round(0.25*A + 0.20*R + 0.20*E + 0.35*P, 1)
```

**Chybějící metriky v kategorii**: pokud například video nemá `video_avg_watch_time` (starý sync před migraci), `avg_watch_pct` je `NaN` → vypustit z průměru. Kategorie s 0 dostupnými metrikami → `null`. Pokud `Performance` kategorie je `null`, fallback na váhy bez Performance (metodika 8 zmíňuje stejný pattern pro awareness kampaně).

**Odvozené metriky** (nejsou přímo v DB, ale počítají se v `score.ts` těsně před normalizací):

- `ctr_link = linkClicks / impressions * 100` — pokud `impressions=0`, vynechat
- `ctr_all = clicks / impressions * 100`
- `hook_rate = videoViews3s / video_plays * 100` — pouze pokud `video_plays > 0`
- `thumb_stop = video_plays / impressions * 100`
- `avg_watch_pct = video_avg_watch_time / video_duration * 100` — `video_duration` zatím NEMÁME v DB, použijeme proxy `video_avg_watch_time / 15` jako fallback (předpokládaná průměrná délka 15s), označit jako known-limitation na Fázi 2
- `thruplay_rate = video_thruplay / impressions * 100`
- `hold_rate = video_thruplay / videoViews3s * 100` — pouze pokud `videoViews3s > 0`
- `cvr = purchases / linkClicks * 100`
- `konv_per_1k = purchases / impressions * 1000`
- `pno = spend / purchaseRevenue * 100` — pouze pokud `purchaseRevenue > 0`
- `cpa`, `cpm` — už jsou v DB

### 4.5 Agenturní defaulty (`defaults.ts`)

Hodnoty pro CZ e-commerce, Fáze 1 startpoint. Lze kdykoliv override per-shop po dosažení 15+ kreativ:

| Metrika            | FAIL | HRANICE | GOOD | TOP  | Invert |
|--------------------|------|---------|------|------|--------|
| CTR link (%)       | 1.0  | 1.8     | 2.5  | 3.5  | ne     |
| CTR all (%)        | 1.2  | 2.0     | 3.0  | 4.0  | ne     |
| Hook rate (%)      | 25   | 40      | 55   | 70   | ne     |
| Thumb stop (%)     | 3    | 6       | 10   | 15   | ne     |
| Avg watch (%)      | 15   | 25      | 40   | 55   | ne     |
| ThruPlay rate (%)  | 6    | 10      | 15   | 22   | ne     |
| Hold rate (%)      | 15   | 25      | 40   | 55   | ne     |
| CPA (Kč)           | 300  | 220     | 160  | 110  | **ano**|
| PNO (%)            | 40   | 32      | 25   | 18   | **ano**|
| CPM (Kč)           | 350  | 240     | 160  | 100  | **ano**|
| CVR (%)            | 1.0  | 1.8     | 2.8  | 4.0  | ne     |
| Konv/1000 impr.    | 0.3  | 0.6     | 1.1  | 1.8  | ne     |

### 4.6 Action label (`action.ts`)

```ts
function actionLabelFromScore(score: number | null): ActionLabel {
  if (score === null) return 'insufficient_data';
  if (score >= 81) return 'excellent';
  if (score >= 61) return 'good';
  if (score >= 31) return 'average';
  return 'weak';
}
```

### 4.7 Benchmarks compute (`compute-benchmarks.ts`)

Percentil helper pro Fázi 1:

```ts
function percentile(values: number[], p: number): number {
  // p ∈ [0, 100]
  const sorted = [...values].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeBenchmarks(
  creatives: CreativeRow[],
  format: Format,
): Partial<Record<MetricKey, Thresholds>> {
  // 1. Filter na relevantní kreativy: spend >= 2*cpa_target (nebo purchases >= 3)
  // 2. Pro každou MetricKey vytáhni hodnoty, spočítej 4 percentily
  //    Non-inverted: top=P90, good=P75, hranice=P40, fail=P25
  //    Inverted:     top=P10, good=P25, hranice=P60, fail=P75
  // 3. Pokud jich je < 15, vrať prázdný objekt (caller použije defaults)
}
```

---

## 5. Benchmark recompute endpoint

### 5.1 POST `/api/benchmarks/recompute`

Body: `{ shopId: string }`

Logika:
1. Auth + ověř `shops.user_id = auth.uid()` (nebo 403).
2. Načti kreativy z `meta_ad_creatives` pro shop kde `date_stop >= now() - interval '30 days'`. Pokud je výsledek prázdný → fallback na all-time bez time filteru.
3. Rozděl na `image` / `video` podle `creative_type`.
4. Pro každý formát:
   - Spočítej `computeBenchmarks(list, format)`.
   - Pokud `sample_size < 15` → použij `defaults.ts` pro daný formát, `is_default=true`.
   - Jinak `is_default=false`.
5. Pro každou dvojici (format, metric) udělej **upsert** do `shop_benchmarks` (unique key `shop_id + format + campaign_type + metric`, `campaign_type='all'`).
6. Response: `{ updated: number, image: { sampleSize, isDefault }, video: { sampleSize, isDefault } }`.

### 5.2 Auto-trigger v sync route

V `/api/creatives/sync/route.ts` **po** úspěšném upsertu kreativ, non-fatal pattern (stejný jako AI logging):

```ts
try {
  const { data: lastBenchmark } = await supabase
    .from('shop_benchmarks')
    .select('computed_at')
    .eq('shop_id', shopId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const staleHours = lastBenchmark?.computed_at
    ? (Date.now() - new Date(lastBenchmark.computed_at).getTime()) / 3_600_000
    : Infinity;

  if (staleHours > 24) {
    await recomputeBenchmarksForShop(supabase, shopId); // sdílený helper
  }
} catch (e) {
  console.error('[sync] benchmark auto-recompute failed:', e);
  // Non-fatal: sync response je stále 200
}
```

### 5.3 Manual button

V `creatives/page.tsx` toolbar, vedle „Synchronizovat", nové tlačítko **„Přepočítat benchmarky"**. Volá `POST /api/benchmarks/recompute`. Po success:
- Toast: `Benchmarky aktualizované · image: N kreativ · video: M kreativ`
- Invalidate `['shop-benchmarks', shopId]` React Query
- Pokud fallback na defaults, toast varianta: `Málo dat pro formát X — používám výchozí hodnoty`

---

## 6. Data flow v klientu

### 6.1 React Query hooks

**Nový hook** `src/hooks/useShopBenchmarks.ts`:

```ts
function useShopBenchmarks(shopId: string) {
  return useQuery({
    queryKey: ['shop-benchmarks', shopId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Benchmarks> => {
      const supabase = createClient();
      const { data } = await supabase
        .from('shop_benchmarks')
        .select('*')
        .eq('shop_id', shopId)
        .eq('campaign_type', 'all');
      // Transformovat rows → Benchmarks nested record
    },
  });
}
```

**Nový hook** `src/hooks/useShopCpaTarget.ts`:

```ts
function useShopCpaTarget(shopId: string, creatives?: CreativeRow[]) {
  // 1. Načte shops.cpa_target_czk
  // 2. Pokud null, spočítá medián CPA z creatives kde purchases > 0
  // 3. Vrací { value, isFallback: boolean }
}
```

### 6.2 Komposice v `creatives/page.tsx`

```ts
const { data: creatives } = useCreativeAnalysis(shopId);
const { data: benchmarks } = useShopBenchmarks(shopId);
const { value: cpaTarget, isFallback } = useShopCpaTarget(shopId, creatives);

const scored = useMemo(() => {
  if (!creatives || !benchmarks || cpaTarget == null) return [];
  return creatives.map((c) => ({
    ...c,
    engagement: scoreCreative(c, benchmarks, cpaTarget),
  }));
}, [creatives, benchmarks, cpaTarget]);
```

`scored` se propaguje do všech 3 view komponent (grid/table/tree) jako nový typ `ScoredCreativeRow = CreativeRow & { engagement: EngagementResult }`.

---

## 7. UI

### 7.1 `EngagementBadge` komponenta

`src/components/creatives/engagement-badge.tsx` — sdílená napříč všemi views:

- Props: `result: EngagementResult`, `size: 'sm' | 'md' | 'lg'`, `showCategoryBars?: boolean`
- Kruhový badge, barva podle `actionLabel`:
  - `excellent` — zelená `#34c759`, text bílý
  - `good` — lime `#a3e635`, text tmavě šedý
  - `average` — oranžová `#ff9f0a`, text bílý
  - `weak` — červená `#ff3b30`, text bílý
  - `insufficient_data` — šedá `#86868b`, text „—", tooltip „Sbírání dat"
- Velikosti: `sm=32px`, `md=40px`, `lg=56px`
- Tooltip na hover: kategoriový rozpad (skrýt null kategorie) + filterReason pokud insufficient
- `showCategoryBars=true` → pod badge render 4 mini-bary (Attention/Retention/Efficiency/Performance), null kategorie ukáže šedý placeholder

### 7.2 Grid (card view)

- Badge `lg` vpravo nahoře na kartě, absolute positioning přes roh thumbnailu
- Pod kartou (pod adName řádkem) řada 4 mini-bars s labely A R E P
- Pro `insufficient_data` kreativy: šedý badge „Sbírání dat", tooltip: `Potřeba spend ≥ {2×cpaTarget} Kč nebo ≥ 3 konverze. Aktuálně: spend {X} Kč, konverze {Y}, kliky {Z}`

### 7.3 Table view

- Nový sloupec `Score` mezi checkboxem a sloupcem `Reklama`
- Defaultní sort desc na tomhle sloupci (přepsat existující sort key)
- Cell: badge `md` + pod ním kategorie jako mini-text `A82 R— E68 P55`
- Sortovatelné — insufficient_data se vždy zařadí na konec bez ohledu na direction

### 7.4 Tree view

- Score **jen na úrovni `AdRow`** (ne `CampaignRow`/`AdSetRow`)
- Agregace score na úrovni kampaně nedává smysl — průměr ze score je lhaní (různé metriky se averageují s různou vahou, průměr by tuto váhu zahodil). Místo toho Campaign/AdSet nadále ukazují weighted Metrics z `creative-aggregation.ts`
- `AdRow` dostane badge `sm` vlevo od adName

### 7.5 Summary bar

Nad view mode toggle:

- **Nová dlaždice** `Ø Engagement Score` — vážený průměr score vážený spendem (kreativa která utratila víc má větší váhu), zaokrouhleno na 1 desetinné místo. Skrýt ze průměru `insufficient_data`.
- **Nová dlaždice** `Kreativy k akci` — tri-count `⭐ 4 · ✅ 12 · ⚠️ 8 · ❌ 3`, **clickable** → filtr kreativ podle labelu. Kliknutí druhýkrát filter vypne.

### 7.6 CPA target input — dvě místa, jeden zdroj

**Zdroj**: `shops.cpa_target_czk`. Oba UI surface update tento sloupec.

**Místo 1 — globální settings** `/dashboard/settings`:

Rozšířit placeholder sekci „Další nastavení" na komponentu `CreativeScoringSettings`:
- Dropdown selector „Vyber shop" (všechny shopy usera)
- Input `CPA target (Kč)` s placeholderem medián z current data
- Tlačítko „Uložit"
- Info text: „Použito pro filtr 'kreativa má dost dat' (spend ≥ 2×CPA target) a pro výpočet Engagement Score."

**Místo 2 — inline popover na creatives page**:

Malá ikona `Settings` v toolbaru (vedle Synchronizovat / Přepočítat benchmarky). Klik otevře popover s inlineinputem a tlačítkem „Uložit". Po uložení:
- Invalidate `['shop-cpa-target', shopId]`
- Score se automaticky přepočítá přes useMemo
- Toast „Uloženo"

**Banner když `cpa_target_czk is null`**:

Nad summary bar na creatives page:
```
⚠️ CPA target není nastaven — používám medián {X} Kč ze tvých kreativ.
   [Nastavit přesný] → otevře popover
```

### 7.7 Barevné pásmo helper

`src/lib/engagement-score/colors.ts`:

```ts
export function colorForAction(label: ActionLabel): { bg: string; fg: string; border: string } {
  switch (label) {
    case 'excellent': return { bg: '#34c759', fg: '#ffffff', border: '#2ca14c' };
    case 'good':      return { bg: '#a3e635', fg: '#1d1d1f', border: '#84cc16' };
    case 'average':   return { bg: '#ff9f0a', fg: '#ffffff', border: '#d97706' };
    case 'weak':      return { bg: '#ff3b30', fg: '#ffffff', border: '#dc2626' };
    case 'insufficient_data': return { bg: '#e5e5ea', fg: '#86868b', border: '#d2d2d7' };
  }
}
```

---

## 8. Testing strategy

### 8.1 Unit testy (`src/lib/engagement-score/*.test.ts`)

- **`normalize.test.ts`**: Příklad z metodiky sekce 6 (CTR 2.1 % → 55), invertovaná metrika (CPA 180 Kč při FAIL=300/HRANICE=220/GOOD=160/TOP=110), hraniční hodnoty (= TOP, = FAIL, < FAIL, > FAIL).
- **`filter.test.ts`**: spend = 2×target (pass), spend = 2×target − 1 Kč (fail), linkClicks = 50 (pass), linkClicks = 49 (fail), purchases = 3 override i při nízkém spend.
- **`score.test.ts`**: Plný image scoring s fiktivní kreativou, ověřit váhy 0.30/0.30/0.40. Plný video scoring, váhy 0.25/0.20/0.20/0.35. Scenario s chybějícími retention metrikami → category=null, pozorovat chování.
- **`compute-benchmarks.test.ts`**: 15 kreativ → percentily jsou deterministické, ověřit proti ručně spočítaným. < 15 kreativ → vrací prázdný objekt. Invertované metriky (CPA) → top = P10, fail = P75.
- **`action.test.ts`**: Hranice 30/31/60/61/80/81, null → insufficient_data.

### 8.2 Integration

- **Non-fatal auto-trigger**: mock `recomputeBenchmarksForShop` aby failnul, zavolej sync route, ověř že response je 200 a body obsahuje ads_synced.
- **CreativeRow kompatibilita**: existing tests v `creative-aggregation.test.ts` musí stále projít (score feature je additive, ne breaking).

### 8.3 Smoke test na live dashboardu po deployi

- Otevři `/dashboard/{shopId}/creatives`
- Ověř viditelný `EngagementBadge` na kartách, v tabulce, ve stromě
- Nastav CPA target přes popover → score se přepočítá bez reloadu
- Klikni „Přepočítat benchmarky" → toast success, benchmarky v `shop_benchmarks` jsou aktualizované
- Klikni dlaždici „Kreativy k akci ⚠️" → filter funguje
- Otevři settings `/dashboard/settings` → dropdown shopů, update CPA target, návrat na creatives page → input se projeví

---

## 9. Non-goals Fáze 1 (explicitní výjimky)

- ❌ Segmentace evergreen / sale / seasonal — Fáze 2
- ❌ AM approval flow, rolling window jako config per shop, >20 % drift alert — Fáze 3
- ❌ Weekly snapshots, Creative Fatigue Index, fatigue alerty — Fáze 4
- ❌ Plnohodnotná diagnostická matice UI (metodika sekce 11) — Fáze 5
- ❌ Detailní akční framework panel (sekce 12) — Fáze 5
- ❌ CSV onboarding import z Meta Ads Manageru (sekce 4) — nepotřebujeme, máme sync route
- ❌ Cron job pro auto-recompute — Fáze 1 má jen sync-time auto-trigger + manual button
- ❌ Notifikace / e-mail alerty
- ❌ Video duration fetch z Meta API (použijeme proxy `avg_watch_time / 15s` ve Fázi 1, proper fix ve Fázi 2)

---

## 10. Známé limitace

1. **`avg_watch_pct` používá proxy** — skutečná délka videa (`video_duration`) není v `meta_ad_creatives` uložená. Ve Fázi 1 počítáme `avg_watch_pct = video_avg_watch_time / 15 * 100`, což je hrubá aproximace předpokládající 15s video. Fáze 2 doplní `video_duration` z Meta Graph API (`source` field na video objectu nebo `video_length_ms`).

2. **Insufficient data label pro video bez thumbnail clicks** — pokud video nemá `linkClicks` protože CTA klikací plocha byla na videu samotném, `cvr` bude `NaN`. V score.ts vypustit z category průměru.

3. **Benchmark recompute dělá lineární scan** — pro shop s 10 000+ kreativami může být > 500 ms. Fáze 3 přidá indexed query nebo materialized view.

4. **Client-side scoring = každý page load re-computes** — `useMemo` cache, ale při invalidaci dělá průchod všemi creativy. Pro > 500 kreativ může být jemný jank. Opt. cestou je `useDeferredValue` nebo batching, ale Fáze 1 necháváme prosté.

---

## 11. Open items pro Fázi 2+

- Segmentace `campaign_type` — jak tagovat kampaň jako evergreen vs sale? Naming convention parsing (kampaně pojmenované `SALE_*`, `BF_*`)? Manuální toggle v UI? Automatická detekce podle date range?
- `video_duration` ukládání pro přesný `avg_watch_pct`
- Weekly snapshot tabulka `engagement_score_snapshots(shop_id, ad_id, week_start, score, category_scores_json)` pro Fatigue Index
- Cron `/api/cron/benchmarks-refresh` — Vercel cron 1×denně projde všechny shopy, kde `computed_at > 24h`, přepočítá
- AM approval UI pro drift > 20 %
- Diagnostická matice jako nová sekce kreativního detailu (metodika 11.1–11.4)
- Action framework „ŠKÁLOVAT / ITEROVAT / KILLNOUT" panel s filtrováním a doporučeními

---

## 12. Závislosti a riziková místa

- **Meta Graph API compatibility**: `video_play_actions` a `video_avg_time_watched_actions` jsou dostupné v Insights API, ale některá events může Meta nevracet pro starší kreativy. Mapování dělat defensivně (`?? 0`).
- **Data migrace**: Existující kreativy v DB nemají `frequency`/`video_plays`/`video_avg_watch_time` — po migraci budou `null`. První sync po deployi je doplní. Do té doby score u starších kreativ může mít chybějící kategorie (hlavně Retention u videí), což je akceptovatelné pro MVP.
- **CPA target fallback median**: pokud shop nemá žádné kreativy s `purchases > 0`, medián nelze spočítat → použít hardcoded `300 Kč` jako poslední fallback s prominent bannerem.
- **Benchmark auto-trigger race**: pokud dva syncy běží paralelně, oba mohou pokusit se recompute. `unique` constraint v DB zajistí korektnost (druhý upsert vyhraje). Non-fatal pattern zajistí že selhání neprojeví v user-facing response.

---

**Další krok:** `writing-plans` skill → implementační plán s konkrétními tasky, commity, závislostmi.
