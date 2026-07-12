# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Folio** is a personal finance tracker (Next.js 14 App Router + TypeScript) for investments, bank deposits, and retirement funds. Data lives in a SQLite database via Prisma, in one of two deployment modes:

- **Local mode** (default, `AUTH_SECRET` unset): no login, SQLite at `prisma/dev.db` — the classic behavior.
- **Cloud mode** (`AUTH_SECRET` set, e.g. on Vercel): Google sign-in required; each user's database is a SQLite file stored as `Folio/folio.db` **in their own Google Drive**. Per request the file is downloaded to `/tmp` (only when its Drive version changed), the existing Prisma code runs against it, and it is uploaded back after writes. The server persists nothing; OAuth tokens live only in the encrypted session cookie.

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

# Run tests (Vitest)
npm test

# Inspect database interactively
npx prisma studio

# After schema changes, regenerate Prisma client
npx prisma generate

# After schema changes, also regenerate the embedded empty-DB template
# (src/lib/template-db.ts, used to seed a new user's Drive in cloud mode)
npm run db:template
```

Tests use Vitest (`npm test`); they live next to the code as `*.test.ts` files under `src/`.

## Architecture

### Data Layer

All data access is centralized in a single Next.js Server Actions file: **`src/app/actions.ts`**. This file handles every read and write operation — there are no separate API routes for data (the only routes are the Auth.js handler at `src/app/api/auth/[...nextauth]/route.ts` and the legacy local-mode OAuth popup callback at `src/app/api/auth/google/callback/route.ts`).

Every exported action is wrapped in **`withDb`** (`src/lib/with-db.ts`): a no-op passthrough in local mode; in cloud mode it authenticates, hydrates the user's DB from Drive, runs the action inside an AsyncLocalStorage context, and uploads the file back if anything was written. New exported actions in `actions.ts` MUST be wrapped in `withDb(...)` unless they touch no data (see `getAppMode`).

- **`src/lib/db.ts`** — the `prisma` export is a Proxy: it resolves to the per-user client from AsyncLocalStorage in cloud mode (flagging the context dirty on any mutating method) or to the classic local singleton otherwise. Also exports `markDbDirty()` (for raw-file writes that bypass Prisma) and `currentDbPath()`.
- **`src/lib/app-mode.ts`** — `isCloudMode()` (= `AUTH_SECRET` set). Import the mode check from here, not from `lib/auth.ts`: this module must stay free of next-auth imports (vitest can't resolve next-auth, and local mode shouldn't load it).
- **`src/lib/auth.ts`** — Auth.js v5 config: Google provider with the `drive.file` scope, offline access + refresh-token rotation, `ALLOWED_EMAILS` allowlist, JWT sessions. Must stay edge-safe (imported by `src/middleware.ts`) — no googleapis/fs/prisma imports.
- **`src/lib/drive-db.ts`** — cloud-mode storage: find-or-create `Folio/folio.db` in the user's Drive, version-checked download to `/tmp`, serialized optimistic-lock uploads (conflict → error asking the user to reload), per-user Prisma client cache. New users are seeded from `src/lib/template-db.ts` (generated — see `npm run db:template`).
- **`src/lib/server-services.ts`** — Isolates server-only Node.js imports (`yahoo-finance2`, `googleapis`, `fs`, `DB_PATH`) so they never leak into Client Components.
- **`src/lib/fx.ts`** — historical EUR/USD FX rates: daily ECB rates synced from the Frankfurter API into `HistoricalPrice` (symbol `EURUSD=X`, price = USD per 1 EUR), plus `convertCurrency`/`fxRateForDate` lookup helpers used by every currency-converting server action. Pages trigger the sync via the wrapped `syncFxRatesAction` (fire-and-forget in local mode, awaited in cloud mode — serverless freezes after the response).

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

Monthly performance uses the **Modified Dietz** method. `getAssetDetails` computes per-symbol performance; `getPortfolioPerformance` aggregates all assets into a global view. Historical prices are synced lazily on each `/investments` page load (`syncHistoricalPrices`): in local mode fire-and-forget, throttled 2–5 s between symbols to avoid Yahoo Finance 429s; in cloud mode awaited, unthrottled, and capped at 2 stale symbols per call (the rest catch up on later loads).

### Pages & Routing

| Route | Component | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Global dashboard — net worth across all asset types |
| `/investments` | `src/app/investments/page.tsx` | Stock/ETF/Crypto portfolio |
| `/investments/[symbol]` | `src/app/investments/[symbol]/page.tsx` | Per-asset detail + monthly performance table |
| `/deposits` | `src/app/deposits/page.tsx` | Bank deposit tracker |
| `/pension` | `src/app/pension/page.tsx` | Retirement fund tracker |

Currency switching (`?currency=EUR` or `?currency=USD`) is a URL query param propagated between pages.

### Shared Types (`src/app/types.ts`)

Client-safe type definitions used by both Server Actions and Client Components: `TransactionData`, `DepositData`, `PensionData`, `Holding`.

### Statement Import Parsers (`src/lib/`)

Two broker import parsers, each with a matching pair of Server Actions in `actions.ts`:

- **`trade-republic-parser.ts`** — parses Trade Republic PDF bank statements. Uses `eval('require')('pdf-parse')` to bypass Next.js bundler restrictions on the pdf-parse module. Called by `parseTradeRepublicStatement` / `importTradeRepublicStatement`.
- **`xtb-parser.ts`** — parses XTB broker Excel (`.xlsx`) exports using the `xlsx` library. Reads the `Cash Operations` sheet (rows start at index 5). XTB tickers use exchange suffixes (e.g. `CDR.PT`) that are stripped to canonical symbols (`CDR`) via `XTB_EXCHANGE_SUFFIX_MAP` in `actions.ts`. Called by `parseXTBStatementAction` / `importXTBStatementAction`.

### Symbol Resolution

`getQuotes` in `actions.ts` normalises three symbol formats before fetching:
- **ISIN** (regex `/^[A-Z]{2}[A-Z0-9]{9}\d$/`) — resolved to ticker via Yahoo Finance search with 24h cache; hardcoded overrides in `ISIN_OVERRIDES` for known problem cases (e.g. Xiaomi Frankfurt `1810.F`).
- **XTB exchange-suffix** (regex `/^[A-Z0-9]+\.(US|PT|ES|IT|FR|BE)$/`) — normalised by `resolveXTBTicker` using `XTB_EXCHANGE_SUFFIX_MAP` / `XTB_TICKER_OVERRIDES`.
- **Plain ticker** — passed through unchanged.

### Portfolio State: Active vs. Closed

- `getPortfolio()` — returns current holdings (net quantity > 0).
- `getSoldPortfolio()` — returns fully-exited positions (net quantity = 0), shown in `ClosedPositionsTable` on the investments page.

### Client Components

All dialogs and interactive components in `src/components/` are `'use client'`. They call Server Actions directly (not via `fetch`). Notable ones:
- `DataManagementDialog` — local export/import, local path backup, and Google Drive backup/restore
- `ImportStatementDialog` / `ImportButton` — Trade Republic PDF statement import
- `ImportXTBDialog` / `ImportXTBButton` — XTB Excel statement import
- `HoldingsTable` — active holdings with inline asset name editing via `updateAssetName`
- `ClosedPositionsTable` — fully-exited positions (read-only)

### UI Stack

Tailwind CSS v4, Recharts for charts, Lucide React for icons. No component library — custom components in `src/components/ui/` (currently only `progress.tsx`).

### Environment Variables

| Variable | Source | Purpose |
|---|---|---|
| `DATABASE_URL` | `.env` | SQLite file path (e.g. `file:./dev.db`); local mode only |
| `AUTH_SECRET` | deployment env | **Enables cloud mode**; JWT session encryption key (`npx auth secret`) |
| `ALLOWED_EMAILS` | deployment env | Cloud mode: comma-separated Google emails allowed to sign in |
| `GOOGLE_CLIENT_ID` | `.env`/env or DB Setting | Google OAuth (login + Drive) |
| `GOOGLE_CLIENT_SECRET` | `.env`/env or DB Setting | Google OAuth (login + Drive) |
| `NEXT_PUBLIC_BASE_URL` | `.env` or DB Setting | Local-mode popup callback URL base (e.g. `http://localhost:3000`) |
| `TWELVEDATA_API_KEY` | DB Setting only | Optional; preferred quote provider |
| `FMP_API_KEY` | DB Setting only | Optional; second-choice quote provider |

API keys for Twelvedata and FMP are stored in the `Setting` table via the Data Management dialog, not in `.env` — in cloud mode that means inside the user's Drive-hosted DB, i.e. per user.

### Deploying (Vercel, cloud mode)

Full user-facing guide: **`docs/DEPLOYMENT.md`**. In short:

1. Google Cloud Console: OAuth client (Web) with redirect URI `https://<app-domain>/api/auth/callback/google`; enable the Drive API; **publish the consent screen to "In production"** (in Testing status Google expires refresh tokens after 7 days; `drive.file` is non-sensitive so publishing needs no verification).
2. Vercel env vars: `AUTH_SECRET`, `ALLOWED_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. `postinstall` runs `prisma generate`; the schema's `binaryTargets` already includes `rhel-openssl-3.0.x`.
3. First login auto-creates `Folio/folio.db` in the user's Drive from the embedded template; existing local data is migrated via Data Management → Export DB (locally) → Import DB (deployed app).
4. Schema changes do NOT auto-migrate the SQLite files in users' Drives — see the caveat section in `docs/DEPLOYMENT.md`.
