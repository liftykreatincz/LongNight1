# Phase 5B — Creative Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Compare 2-4 creatives side-by-side with overlay trend chart and diff table.

**Architecture:** New compare page at `/dashboard/[shopId]/creatives/compare?ids=ad1,ad2`. Entry points: selection bar in grid/table + "Porovnat" on detail page. Reuses `useDailyInsights` for trend data and `useCreativeAnalysis` for aggregate metrics.

**Tech Stack:** Next.js App Router, Recharts LineChart, TanStack Query, Tailwind.

---

### Task 5B-1: Creative Picker Modal

**Files:**
- Create: `src/components/creatives/creative-picker-modal.tsx`

Modal with search input, list of creatives (thumbnail + name + key metrics), click to select. Used from detail page "Porovnat" button.

### Task 5B-2: Compare Page

**Files:**
- Create: `src/app/dashboard/[shopId]/creatives/compare/page.tsx`

Reads `ids` from search params. Fetches creatives + daily data per ad. Layout: side-by-side cards, overlay trend chart, diff table.

### Task 5B-3: "Porovnat" Button in Selection Bar

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

Add "Porovnat" button in the floating selection bar (when 2+ selected). Navigates to compare page with selected IDs.

### Task 5B-4: Verify + Push
