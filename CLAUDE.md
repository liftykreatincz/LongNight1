# Long Night — CLAUDE.md

## Project Overview

**Long Night** is a standalone Meta Ads creative analysis app.
Users can add eshops with Meta Ads API credentials, sync ad creatives, and run AI-powered analysis using Claude.

- **Deployment**: Vercel
- **Supabase**: Separate project (not shared with LiftStats)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Package manager | **bun** (use `bun` not `npm`) |
| Styling | Tailwind CSS 4 + shadcn/ui (base-ui variant) |
| Icons | Lucide React |
| Data fetching | TanStack Query v5 |
| Backend | Supabase (PostgreSQL + Auth) |
| AI | Claude API (Anthropic) |
| Meta API | Meta Marketing API v21.0 |

---

## Project Structure

```
LongNight/
├── src/
│   ├── app/
│   │   ├── login/             # Login page + server action
│   │   ├── dashboard/         # Dashboard layout + eshop list
│   │   │   └── [shopId]/      # Eshop detail + creatives
│   │   │       └── creatives/ # Creative analysis page
│   │   └── api/creatives/     # API routes (sync, analyze)
│   ├── components/            # Reusable + shadcn/ui components
│   ├── hooks/                 # React hooks
│   └── lib/
│       ├── supabase/          # Supabase client configs
│       └── meta-api.ts        # Meta API helpers
├── .env.local                 # Environment variables — DO NOT COMMIT
└── CLAUDE.md
```

---

## Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server (localhost:3000)
bun run build        # Production build
bun run lint         # ESLint
```

---

## Coding Guidelines

- **TypeScript** — proper types, no `any`
- **Styling** — Tailwind classes only
- **UI** — shadcn/ui from `src/components/ui/` (base-ui variant, use `render` prop not `asChild`)
- **Data** — TanStack Query for client-side fetching
- **Icons** — Lucide React only
- **Imports** — use `@/` alias

---

## CRITICAL: What NOT to Touch

```
.env.local              — never commit
src/components/ui/*     — shadcn generated
bun.lock                — auto-generated
```

---

## Git Workflow

- Never `git add -A` blindly
- Never commit `.env.local` or secrets
- **ALWAYS ASK before pushing**
