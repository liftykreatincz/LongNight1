# Creatives Tree View — Design

**Date:** 2026-04-09
**Status:** Approved, pending implementation plan

## Problem

Současná stránka Kreativ ukazuje plochý grid/tabulku reklam. Uživatel chce **klasické hierarchické zobrazení Kampaň → Ad Set → Reklama** pro lepší filtrování a orientaci, jaké zná z Meta Ads Manageru.

## Approach

**Klientské grupování** nad už načtenými daty z `meta_ad_creatives` (žádná DB změna, žádný druhý round-trip). Přepínač view v toolbaru mezi plochým seznamem a stromem. Výběr persistovaný v `localStorage`.

### Alternativy zvažované
- **Miller columns (3 sloupce vedle sebe)** — elegantní ale moc široké pro tabulku s 8+ metric sloupci.
- **Filter sidebar + plochá tabulka** — neřeší agregaci metrik na úrovni kampaně.
- **Přepínač view per úroveň** — vyžaduje víc klikání pro drill-down.
- Zvolen **rozbalovací strom** jako nejbližší Meta Ads Manageru.

## Data model

Beze změn. `meta_ad_creatives` už obsahuje `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `ad_id`, metriky.

## Grupování & agregace

Nový pure helper `src/lib/creative-aggregation.ts`:

```ts
export type MetricBundle = {
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  landing_page_views: number;
  purchases: number;
  purchase_revenue: number;
  // derived:
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
  cvr: number | null;
};

export function aggregateMetrics(ads: Creative[]): MetricBundle {
  const sum = ads.reduce((acc, ad) => ({
    spend: acc.spend + Number(ad.spend ?? 0),
    impressions: acc.impressions + Number(ad.impressions ?? 0),
    clicks: acc.clicks + Number(ad.clicks ?? 0),
    link_clicks: acc.link_clicks + Number(ad.link_clicks ?? 0),
    landing_page_views: acc.landing_page_views + Number(ad.landing_page_views ?? 0),
    purchases: acc.purchases + Number(ad.purchases ?? 0),
    purchase_revenue: acc.purchase_revenue + Number(ad.purchase_revenue ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, landing_page_views: 0, purchases: 0, purchase_revenue: 0 });

  const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);

  return {
    ...sum,
    ctr: safeDiv(sum.clicks, sum.impressions),
    cpc: safeDiv(sum.spend, sum.clicks),
    cpa: safeDiv(sum.spend, sum.purchases),
    roas: safeDiv(sum.purchase_revenue, sum.spend),
    cvr: safeDiv(sum.purchases, sum.link_clicks),
  };
}

export function groupIntoTree(ads: Creative[]): CampaignNode[] { … }
```

**Vážené poměry:** CTR, CPC, CPA, ROAS, CVR se počítají **ze sumovaných hodnot**, ne průměrem reklam. To odpovídá Meta Ads Manageru.

`groupIntoTree` vrací:
```ts
type CampaignNode = {
  id: string; name: string;
  metrics: MetricBundle;
  adSets: AdSetNode[];
};
type AdSetNode = {
  id: string; name: string;
  metrics: MetricBundle;
  ads: Creative[];
};
```

**Testy** (vitest nebo jen node test): 3 reklamy se známými čísly → ověř sumy i vážené poměry. Vážené průměry se snadno splete, proto chci testy.

## UI

### View toggle
Segmentovaný přepínač v toolbaru vedle existujících filtrů:
```
[ Plochý seznam ] [ Strom ]
```
- **Default: Plochý seznam** (zpětně kompatibilní).
- Volba v `localStorage` pod `creatives-view-mode`.
- Při přepnutí na strom se objeví buttony `Rozbalit vše` / `Sbalit vše`.

### Strom
```
▸  Kampaň A                 [3 ad sety · 12 reklam]    | spend | impr | CTR | purch | CPA | ROAS | revenue
   ▸  Ad Set A1             [4 reklamy]                 | spend | impr | CTR | purch | CPA | ROAS | revenue
      ·  [thumb] Reklama 1                              | spend | impr | CTR | purch | CPA | ROAS | revenue | [Analyze] [Meta Analyze]
      ·  [thumb] Reklama 2                              | …
   ▸  Ad Set A2             [5 reklam]
▸  Kampaň B                 …
```

- **Odsazení:** `padding-left: 0 / 20px / 40px` pro úrovně.
- **Chevron** (chevron-right / chevron-down) před názvem kampaně a ad setu.
- **Počty dětí** jako tichá šedá badge `[3 ad sety · 12 reklam]` vedle názvu.
- **Sloupce metrik identické** s plochou tabulkou (reuse stejných render funkcí).
- **Analyze tlačítka jen na reklamách** (listy stromu).

### Expand state
- `useState<Set<string>>` pro expanded campaigns + expanded ad sets.
- **Default všechno sbaleno** při otevření stromu.
- Stav se **neukládá** do localStorage (čisté při každém otevření).
- `Rozbalit vše` / `Sbalit vše` toolbar buttony.

## Filtry, řazení, search

- **Existující filtry** (date range, status, search) běží stejně — na úrovni reklam.
- Vyfiltrované pole reklam se **předá do `groupIntoTree()`**. Kampaně/ad sety bez zbývajících dětí se do stromu nedostanou.
- **Search match na reklamě** → rodiče se auto-rozbalí (`expandedCampaigns.add(campaign_id)` atd.).
- **Řazení sloupce** aplikované per úroveň: kampaně mezi sebou, ad sety uvnitř kampaně mezi sebou, reklamy uvnitř ad setu mezi sebou.

## Komponenty

Nové:
- `src/lib/creative-aggregation.ts` — helpers + testy
- `src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx` — stromový renderer
- `src/app/dashboard/[shopId]/creatives/view-toggle.tsx` — segmentovaný přepínač

Upravené:
- `src/app/dashboard/[shopId]/creatives/creatives-client.tsx` (nebo odpovídající wrapper) — přidá state `viewMode`, podle toho renderuje plochý nebo stromový view, předá stejná filtrovaná data.

Plochá tabulka `creatives-table.tsx` zůstává **netknutá**.

## Error handling

- Prázdné filtry → prázdný strom, empty state zpráva.
- Reklama bez `campaign_id` nebo `adset_id` → spadne do pseudo-skupiny `"(Bez kampaně)"` / `"(Bez ad setu)"`, ne do chyby.
- Dělení nulou v agregacích → `null` → UI zobrazí `—`.

## Testing

Unit:
- `aggregateMetrics([])` → nuly + všechny ratio `null`.
- 2 reklamy: (1000 impr, 20 clicks) + (500 impr, 30 clicks) → CTR = 50/1500 = 3.33% (ne průměr 2% a 6% = 4%).
- Dělení nulou: 1 reklama s 0 purchases → CPA `null`.

Manuální:
1. Otevři stránku Kreativ → default plochý list.
2. Klikni "Strom" → vidíš kampaně sbalené, metriky agregované.
3. Rozbal kampaň → ad sety. Rozbal ad set → reklamy.
4. Zkontroluj, že součet spendu ad setů = spend kampaně.
5. Zapni filtr date range → strom se aktualizuje.
6. Search podle názvu reklamy → rodiče auto-rozbalení.
7. Refresh stránky → přepínač si pamatuje volbu.

## Out of scope (YAGNI)

- Bulk "Analyze všechny reklamy v ad setu".
- Drag & drop přeskupování.
- Kolaps stavu persistovaný mezi návštěvami.
- Virtualizace dlouhých seznamů (řešíme až při problému).
- Sloupcová viditelnost / column chooser.
- Export stromu do CSV.
