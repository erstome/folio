# Historical FX Rates — Design Spec

**Date:** 2026-07-12
**Status:** Approved

## Problem

All currency conversion in Folio uses a single *current* EUR/USD spot rate (or a
hardcoded `1.1` fallback) regardless of when a transaction happened:

- `getPortfolio` and `getSoldPortfolio` convert every historical BUY/SELL at
  today's rate, so cost basis and closed-position P/L for EUR-priced
  transactions on USD assets (and vice versa) are inaccurate.
- `getIncomeSummary` converts every dividend/interest payment at today's rate.
- `getPortfolioPerformance` already looks up historical `EURUSD=X` rows in the
  `HistoricalPrice` table, **but nothing ever writes them**, so it silently
  falls back to a hardcoded `1.1` for every month.

## Goal

Convert every amount at the FX rate of its own date, using stored daily
historical rates, with graceful degradation when data is missing.

## Approach (chosen: A)

Fetch daily EUR→USD rates from the **Frankfurter API** (free, key-less,
official ECB reference rates) and store them in the **existing
`HistoricalPrice` table** under symbol `EURUSD=X`. No schema change.

Rate semantics: `price` = USD per 1 EUR (matches the `EURUSD=X` convention
already assumed by `getPortfolioPerformance`). `currency` column = `'USD'`.

Rejected alternatives:
- Monthly rates via the existing Yahoo `syncHistoricalPrices` loop — coarser
  granularity and inherits Yahoo 429 fragility.
- Dedicated `FxRate` table — schema migration and new read paths for the same
  numerical result.

## Components

### New module: `src/lib/fx.ts` (server-only)

- `syncFxRates(): Promise<{ success: boolean }>`
  - Determines start date: day after the most recent stored `EURUSD=X` row;
    on first run, the earliest `Transaction.date` in the DB (fallback
    `2020-01-01`).
  - Skips entirely if the last stored rate is less than 3 days old (covers
    weekends when ECB publishes nothing).
  - Fetches `https://api.frankfurter.dev/v1/{start}..{end}?symbols=USD` —
    one HTTP call returns the full daily range (`{ rates: { "YYYY-MM-DD":
    { USD: number } } }`).
  - Upserts each day into `HistoricalPrice` via the existing
    `@@unique([symbol, date])` key. Dates normalized to UTC midnight.
  - On any error: log a warning and return `{ success: false }`; existing
    rows remain usable.

- `loadFxRates(): Promise<FxRates>`
  - Single query for all `EURUSD=X` rows, returned as a sorted array plus a
    `Map<dateString, rate>` for O(1) exact lookups.

- `fxRateForDate(rates: FxRates, date: Date, spotFallback?: number): number`
  - Exact date match → nearest **earlier** date (binary search; handles
    weekends/holidays) → `spotFallback` (live rate the caller may already
    have) → `1.1`.
  - A date earlier than the first stored rate uses the first stored rate.

- `convertCurrency(amount: number, from: string, to: string, rates: FxRates, date: Date, spotFallback?: number): number`
  - `from === to` → unchanged. EUR→USD multiplies by the rate; USD→EUR
    divides. Unknown pairs return the amount unchanged (current behavior).

### Sync triggers

Fire-and-forget `syncFxRates()` call added where `syncHistoricalPrices` is
already triggered (`/investments` page load) **and** on the dashboard
(`/` page load). It is one cheap HTTP call, throttling is not needed.

### Consumers updated (all in `src/app/actions.ts`)

| Function | Change |
|---|---|
| `getPortfolio` | Load rates once; convert each trade at its transaction date instead of a single spot rate. |
| `getSoldPortfolio` | Same — proceeds and cost of sold shares converted per transaction date. |
| `getIncomeSummary` | Each DIVIDEND/INTEREST converted at its payment date. |
| `getPortfolioPerformance` | Keep the existing month-end lookup, but replace the hardcoded `1.1` fallback with `fxRateForDate` (nearest-earlier). |
| `getAssetDetails` | **Untouched** — operates in the asset's own currency. |

The live spot rate (from `getQuotes(['EURUSD=X'])`) is still fetched by
consumers and passed as `spotFallback`, preserving today's behavior when no
historical data exists yet (e.g. first run while offline).

## Error handling

- Frankfurter unreachable / non-200 / malformed JSON → warn + `{ success:
  false }`; conversion falls back through: nearest stored rate → live spot →
  `1.1`. The app never breaks for lack of FX data.
- Weekend/holiday transaction dates → nearest earlier stored rate.

## Testing

Introduces the project's first test infrastructure: **Vitest** (`npm test`).

- `src/lib/fx.test.ts` — pure-logic tests:
  - `fxRateForDate`: exact hit, weekend (nearest-earlier), date before first
    row, empty rate set → spot fallback → 1.1.
  - `convertCurrency`: both directions, same-currency no-op, unknown pair.
  - Frankfurter response parsing + start-date logic with mocked `fetch` and
    mocked Prisma.
- Consumer math test: cost basis for a mixed-currency transaction sequence
  against a mocked Prisma layer.

## Expected visible changes

Cost bases, closed-position P/L, and income totals shift slightly — they
become historically correct. The performance chart's currency conversion
stops using a constant `1.1`.

## Out of scope

- Currencies beyond EUR/USD (GBP, CHF) — the helper's signature allows a
  future extension but only the EURUSD pair is synced.
- Refactoring `actions.ts` into modules (tracked separately as improvement I1).
- Fees on transactions (I4).
