# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Folio** is a personal finance tracker (Next.js 14 App Router + TypeScript) for investments, bank deposits, and retirement funds. All data is stored locally in a SQLite database via Prisma.

## Commands

```bash
# Install dependencies
npm install

# Initialize the database (creates prisma/dev.db)
npx prisma db push

# Development server (binds to 0.0.0.0 for LAN access)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Inspect database interactively
npx prisma studio

# After schema changes, regenerate Prisma client
npx prisma generate
```

There are no automated tests in this project.

## Architecture

### Data Layer

All data access is centralized in a single Next.js Server Actions file: **`src/app/actions.ts`**. This file handles every read and write operation — there are no separate API routes for data (the only route is the Google OAuth callback at `src/app/api/auth/google/callback/route.ts`).

- **`src/lib/db.ts`** — Prisma singleton (prevents multiple client instances in dev HMR).
- **`src/lib/server-services.ts`** — Isolates server-only Node.js imports (`yahoo-finance2`, `googleapis`, `fs`, `DB_PATH`) so they never leak into Client Components.

### Database Schema (`prisma/schema.prisma`)

Single `Asset` table with a `type` discriminator:
- `STOCK` / `ETF` / `CRYPTO` — market-priced assets with `Transaction` rows
- `DEPOSIT` — bank deposits; principal stored as `Transaction.price` (quantity = 1)
- `PENSION` — retirement funds; `manualPrice` field stores current unit price

`HistoricalPrice` stores end-of-month prices per symbol for the performance chart. `Setting` stores key-value app configuration (API keys, backup path, OAuth credentials) that can override environment variables.

### Quote Fetching (`getQuotes` in actions.ts)

Priority: **Twelvedata → FMP → Yahoo Finance → DB cache** (last known price).
An in-memory cache (5 min TTL) sits in front of all providers. ISINs are resolved to ticker symbols via Yahoo Finance search, with a 24h ISIN cache and a hardcoded `ISIN_OVERRIDES` map for known problematic ISINs (e.g. Xiaomi Frankfurt).

### Performance Calculation

Monthly performance uses the **Modified Dietz** method. `getAssetDetails` computes per-symbol performance; `getPortfolioPerformance` aggregates all assets into a global view. Historical prices are synced lazily in the background on each `/investments` page load (`syncHistoricalPrices`), throttled 2–5 s between symbols to avoid Yahoo Finance 429s.

### Pages & Routing

| Route | Component | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Global dashboard — net worth across all asset types |
| `/investments` | `src/app/investments/page.tsx` | Stock/ETF/Crypto portfolio |
| `/investments/[symbol]` | `src/app/investments/[symbol]/page.tsx` | Per-asset detail + monthly performance table |
| `/deposits` | `src/app/deposits/page.tsx` | Bank deposit tracker |
| `/pension` | `src/app/pension/page.tsx` | Retirement fund tracker |

Currency switching (`?currency=EUR` or `?currency=USD`) is a URL query param propagated between pages.

### Client Components

All dialogs and interactive components in `src/components/` are `'use client'`. They call Server Actions directly (not via `fetch`). Notable ones:
- `DataManagementDialog` — local export/import, local path backup, and Google Drive backup/restore
- `ImportStatementDialog` / `ImportButton` — Trade Republic PDF statement import
- `HoldingsTable` — inline asset name editing via `updateAssetName` Server Action

### Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `DATABASE_URL` | `.env` | SQLite file path (e.g. `file:./dev.db`) |
| `GOOGLE_CLIENT_ID` | `.env` or DB Setting | Google OAuth for Drive backup |
| `GOOGLE_CLIENT_SECRET` | `.env` or DB Setting | Google OAuth for Drive backup |
| `NEXT_PUBLIC_BASE_URL` | `.env` or DB Setting | Callback URL base (e.g. `http://localhost:3000`) |
| `TWELVEDATA_API_KEY` | DB Setting only | Optional; preferred quote provider |
| `FMP_API_KEY` | DB Setting only | Optional; second-choice quote provider |

API keys for Twelvedata and FMP are stored in the `Setting` table via the Data Management dialog, not in `.env`.
