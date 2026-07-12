# Historical FX Rates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every historical amount at the FX rate of its own date, using daily ECB EUR/USD rates stored in the existing `HistoricalPrice` table.

**Architecture:** A new server-only module `src/lib/fx.ts` syncs daily rates from the Frankfurter API (free, key-less ECB data) into `HistoricalPrice` under symbol `EURUSD=X`, and exposes pure lookup/conversion helpers. Four server actions in `src/app/actions.ts` switch from a single live spot rate to per-date conversion. This also introduces the project's first test infrastructure (Vitest).

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Prisma 5 + SQLite, Vitest (new).

**Spec:** `docs/superpowers/specs/2026-07-12-historical-fx-rates-design.md`

## Global Constraints

- **No Prisma schema changes.** FX rates are stored as `HistoricalPrice` rows: `{ symbol: 'EURUSD=X', date: <UTC midnight>, price: <USD per 1 EUR>, currency: 'USD' }`.
- Prisma is always imported as `import { prisma } from '@/lib/db'` (singleton).
- The `@/*` path alias maps to `./src/*` (see `tsconfig.json`); Vitest must resolve it too.
- Follow existing code style in each file: 4-space indent, single quotes, no semicolon-free style changes.
- Fallback chain for a missing rate (in order): nearest earlier stored rate → first stored rate (for dates before history begins) → live spot rate passed by the caller → `1.1`. Never throw for a missing rate.
- `fetch` is the global Node 18+ fetch — no HTTP library.
- Frankfurter endpoint: `https://api.frankfurter.dev/v1/{YYYY-MM-DD}..{YYYY-MM-DD}?symbols=USD` returning `{ "rates": { "YYYY-MM-DD": { "USD": 1.09 }, ... } }` (weekends/holidays absent).
- Commit after every task. Do not commit `.claude/settings.json` (it has unrelated local modifications).

---

### Task 1: Vitest infrastructure

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.ts`
- Create: `src/lib/fx.test.ts` (smoke test only; real tests come in Task 2)

**Interfaces:**
- Produces: `npm test` (single run) and `npm run test:watch` commands that later tasks use for TDD.

- [ ] **Step 1: Install Vitest and the tsconfig-paths plugin**

Run:
```bash
npm install -D vitest vite-tsconfig-paths
```
Expected: both packages appear under `devDependencies` in `package.json`.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts` at the repo root:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
})
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test proving the `@/` alias resolves**

Create `src/lib/fx.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { TransactionData } from '@/app/types'

describe('test infrastructure', () => {
    it('resolves the @/ path alias', () => {
        const tx: Partial<TransactionData> = { symbol: 'AAPL' }
        expect(tx.symbol).toBe('AAPL')
    })
})
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: `1 passed` — the alias import compiled and ran.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/fx.test.ts
git commit -m "test: add vitest infrastructure with tsconfig path aliases"
```

---

### Task 2: Pure FX helpers — `buildFxRates`, `fxRateForDate`, `convertCurrency`

**Files:**
- Create: `src/lib/fx.ts`
- Modify: `src/lib/fx.test.ts` (replace the smoke test's describe block content is kept; add new describe blocks)

**Interfaces:**
- Produces (used by Tasks 3, 5, 6, 7):
  - `type FxRates = { dates: string[]; byDate: Map<string, number> }` — `dates` sorted ascending `'YYYY-MM-DD'`; `byDate` maps date string → USD per 1 EUR.
  - `buildFxRates(rows: { date: Date; price: number }[]): FxRates`
  - `fxRateForDate(rates: FxRates, date: Date, spotFallback?: number): number`
  - `convertCurrency(amount: number, from: string, to: string, rates: FxRates, date: Date, spotFallback?: number): number`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/fx.test.ts`:

```ts
import { buildFxRates, fxRateForDate, convertCurrency } from '@/lib/fx'

const rates = buildFxRates([
    { date: new Date('2024-01-15T00:00:00.000Z'), price: 1.10 },
    { date: new Date('2024-01-16T00:00:00.000Z'), price: 1.12 },
    { date: new Date('2024-06-14T00:00:00.000Z'), price: 1.08 }, // a Friday
])

describe('fxRateForDate', () => {
    it('returns the exact rate when the date has a stored rate', () => {
        expect(fxRateForDate(rates, new Date('2024-01-15T12:00:00.000Z'))).toBe(1.10)
    })

    it('falls back to the nearest earlier rate on weekends/holidays', () => {
        // 2024-06-16 is a Sunday; nearest earlier stored day is Friday 2024-06-14
        expect(fxRateForDate(rates, new Date('2024-06-16T09:30:00.000Z'))).toBe(1.08)
    })

    it('uses the first stored rate for dates before history begins', () => {
        expect(fxRateForDate(rates, new Date('2023-12-01T00:00:00.000Z'))).toBe(1.10)
    })

    it('uses the spot fallback when no rates are stored', () => {
        expect(fxRateForDate(buildFxRates([]), new Date(), 1.05)).toBe(1.05)
    })

    it('uses 1.1 when no rates are stored and no spot fallback given', () => {
        expect(fxRateForDate(buildFxRates([]), new Date())).toBe(1.1)
    })
})

describe('convertCurrency', () => {
    const d = new Date('2024-01-16T00:00:00.000Z') // rate 1.12

    it('returns the amount unchanged for same-currency conversion', () => {
        expect(convertCurrency(100, 'EUR', 'EUR', rates, d)).toBe(100)
    })

    it('converts EUR to USD by multiplying by the rate', () => {
        expect(convertCurrency(100, 'EUR', 'USD', rates, d)).toBeCloseTo(112, 10)
    })

    it('converts USD to EUR by dividing by the rate', () => {
        expect(convertCurrency(112, 'USD', 'EUR', rates, d)).toBeCloseTo(100, 10)
    })

    it('returns the amount unchanged for unknown currency pairs', () => {
        expect(convertCurrency(100, 'GBP', 'EUR', rates, d)).toBe(100)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/fx'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/lib/fx.ts`:

```ts
// Historical EUR/USD FX rates.
// Rates are stored in the HistoricalPrice table under symbol 'EURUSD=X'
// with price = USD per 1 EUR (matching the Yahoo EURUSD=X convention
// already assumed by getPortfolioPerformance).

const FX_SYMBOL = 'EURUSD=X'
const FALLBACK_RATE = 1.1

export type FxRates = {
    dates: string[]                 // sorted ascending, 'YYYY-MM-DD'
    byDate: Map<string, number>     // 'YYYY-MM-DD' -> USD per 1 EUR
}

export function buildFxRates(rows: { date: Date; price: number }[]): FxRates {
    const byDate = new Map<string, number>()
    for (const row of rows) {
        byDate.set(row.date.toISOString().split('T')[0], row.price)
    }
    return { dates: Array.from(byDate.keys()).sort(), byDate }
}

export function fxRateForDate(rates: FxRates, date: Date, spotFallback?: number): number {
    if (rates.dates.length === 0) return spotFallback ?? FALLBACK_RATE

    const target = date.toISOString().split('T')[0]
    const exact = rates.byDate.get(target)
    if (exact !== undefined) return exact

    // Binary search for the latest stored date <= target (weekends/holidays
    // have no ECB rate, so fall back to the previous trading day).
    let lo = 0
    let hi = rates.dates.length - 1
    let best = -1
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (rates.dates[mid] <= target) {
            best = mid
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }

    // A date before history begins uses the first stored rate.
    const key = best === -1 ? rates.dates[0] : rates.dates[best]
    return rates.byDate.get(key)!
}

export function convertCurrency(
    amount: number,
    from: string,
    to: string,
    rates: FxRates,
    date: Date,
    spotFallback?: number
): number {
    if (from === to) return amount
    const rate = fxRateForDate(rates, date, spotFallback)
    if (from === 'EUR' && to === 'USD') return amount * rate
    if (from === 'USD' && to === 'EUR') return amount / rate
    return amount // unknown pair: preserve existing app behavior
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (1 smoke + 9 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fx.ts src/lib/fx.test.ts
git commit -m "feat(fx): add pure FX rate lookup and conversion helpers"
```

---

### Task 3: `syncFxRates` and `loadFxRates`

**Files:**
- Modify: `src/lib/fx.ts` (append)
- Modify: `src/lib/fx.test.ts` (append; add prisma + fetch mocks)

**Interfaces:**
- Consumes: `buildFxRates` from Task 2.
- Produces (used by Tasks 4–7):
  - `syncFxRates(): Promise<{ success: boolean }>` — incremental daily-rate sync from Frankfurter.
  - `loadFxRates(): Promise<FxRates>` — loads all stored `EURUSD=X` rows.

- [ ] **Step 1: Write the failing tests**

`vi.mock` is hoisted, so add the mock at the **top** of `src/lib/fx.test.ts` (before other imports), and the new describe block at the bottom. Top of file becomes:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
    prisma: {
        historicalPrice: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        transaction: {
            findFirst: vi.fn(),
        },
    },
}))

import { prisma } from '@/lib/db'
```

(Keep the existing imports and tests; only `vi` and `beforeEach` are added to the vitest import.)

Append at the bottom:

```ts
import { syncFxRates, loadFxRates } from '@/lib/fx'

const mockedPrisma = vi.mocked(prisma, true)
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
}) as unknown as Response

describe('syncFxRates', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('skips the fetch entirely when the last stored rate is fresher than 3 days', async () => {
        mockedPrisma.historicalPrice.findFirst.mockResolvedValue({ date: new Date() } as any)
        const res = await syncFxRates()
        expect(res.success).toBe(true)
        expect(mockFetch).not.toHaveBeenCalled()
    })

    it('fetches from the day after the last stored rate and upserts each day', async () => {
        mockedPrisma.historicalPrice.findFirst.mockResolvedValue({ date: new Date('2024-06-01T00:00:00.000Z') } as any)
        mockFetch.mockResolvedValue(okResponse({ rates: { '2024-06-03': { USD: 1.09 } } }))

        const res = await syncFxRates()

        expect(res.success).toBe(true)
        expect(mockFetch).toHaveBeenCalledTimes(1)
        const url = mockFetch.mock.calls[0][0] as string
        expect(url).toContain('/v1/2024-06-02..')
        expect(url).toContain('symbols=USD')
        expect(mockedPrisma.historicalPrice.upsert).toHaveBeenCalledWith({
            where: { symbol_date: { symbol: 'EURUSD=X', date: new Date('2024-06-03T00:00:00.000Z') } },
            update: { price: 1.09, currency: 'USD' },
            create: { symbol: 'EURUSD=X', date: new Date('2024-06-03T00:00:00.000Z'), price: 1.09, currency: 'USD' },
        })
    })

    it('starts from the earliest transaction date on first run', async () => {
        mockedPrisma.historicalPrice.findFirst.mockResolvedValue(null)
        mockedPrisma.transaction.findFirst.mockResolvedValue({ date: new Date('2023-03-10T00:00:00.000Z') } as any)
        mockFetch.mockResolvedValue(okResponse({ rates: {} }))

        await syncFxRates()

        const url = mockFetch.mock.calls[0][0] as string
        expect(url).toContain('/v1/2023-03-10..')
    })

    it('falls back to 2020-01-01 when there are no transactions at all', async () => {
        mockedPrisma.historicalPrice.findFirst.mockResolvedValue(null)
        mockedPrisma.transaction.findFirst.mockResolvedValue(null)
        mockFetch.mockResolvedValue(okResponse({ rates: {} }))

        await syncFxRates()

        const url = mockFetch.mock.calls[0][0] as string
        expect(url).toContain('/v1/2020-01-01..')
    })

    it('returns success:false and upserts nothing on HTTP error', async () => {
        mockedPrisma.historicalPrice.findFirst.mockResolvedValue(null)
        mockedPrisma.transaction.findFirst.mockResolvedValue(null)
        mockFetch.mockResolvedValue({ ok: false, status: 500 } as unknown as Response)

        const res = await syncFxRates()

        expect(res.success).toBe(false)
        expect(mockedPrisma.historicalPrice.upsert).not.toHaveBeenCalled()
    })

    it('returns success:false on a malformed response body', async () => {
        mockedPrisma.historicalPrice.findFirst.mockResolvedValue(null)
        mockedPrisma.transaction.findFirst.mockResolvedValue(null)
        mockFetch.mockResolvedValue(okResponse({ unexpected: true }))

        const res = await syncFxRates()

        expect(res.success).toBe(false)
    })

    it('skips days with missing or non-positive USD values', async () => {
        mockedPrisma.historicalPrice.findFirst.mockResolvedValue(null)
        mockedPrisma.transaction.findFirst.mockResolvedValue(null)
        mockFetch.mockResolvedValue(okResponse({
            rates: {
                '2024-06-03': { USD: 0 },
                '2024-06-04': {},
                '2024-06-05': { USD: 1.09 },
            },
        }))

        const res = await syncFxRates()

        expect(res.success).toBe(true)
        expect(mockedPrisma.historicalPrice.upsert).toHaveBeenCalledTimes(1)
    })
})

describe('loadFxRates', () => {
    it('loads stored EURUSD=X rows into an FxRates structure', async () => {
        mockedPrisma.historicalPrice.findMany.mockResolvedValue([
            { date: new Date('2024-01-15T00:00:00.000Z'), price: 1.10 },
        ] as any)

        const loaded = await loadFxRates()

        expect(mockedPrisma.historicalPrice.findMany).toHaveBeenCalledWith({
            where: { symbol: 'EURUSD=X' },
            orderBy: { date: 'asc' },
            select: { date: true, price: true },
        })
        expect(fxRateForDate(loaded, new Date('2024-01-15T00:00:00.000Z'))).toBe(1.10)
    })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `syncFxRates` / `loadFxRates` are not exported from `@/lib/fx`. The Task 2 tests must still pass.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/fx.ts` (and add the prisma import at the top of the file):

```ts
import { prisma } from '@/lib/db'
```

```ts
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
const toDateStr = (d: Date) => d.toISOString().split('T')[0]

export async function loadFxRates(): Promise<FxRates> {
    const rows = await prisma.historicalPrice.findMany({
        where: { symbol: FX_SYMBOL },
        orderBy: { date: 'asc' },
        select: { date: true, price: true },
    })
    return buildFxRates(rows)
}

// Incremental sync of daily ECB EUR->USD rates from the Frankfurter API.
// One HTTP call covers the whole missing range. Skips when the last stored
// rate is <3 days old (ECB publishes nothing on weekends).
export async function syncFxRates(): Promise<{ success: boolean }> {
    try {
        const last = await prisma.historicalPrice.findFirst({
            where: { symbol: FX_SYMBOL },
            orderBy: { date: 'desc' },
            select: { date: true },
        })

        const now = new Date()
        if (last && now.getTime() - last.date.getTime() < THREE_DAYS_MS) {
            return { success: true }
        }

        let start: Date
        if (last) {
            start = new Date(last.date.getTime() + 24 * 60 * 60 * 1000)
        } else {
            const firstTx = await prisma.transaction.findFirst({
                orderBy: { date: 'asc' },
                select: { date: true },
            })
            start = firstTx?.date ?? new Date('2020-01-01T00:00:00.000Z')
        }

        const url = `https://api.frankfurter.dev/v1/${toDateStr(start)}..${toDateStr(now)}?symbols=USD`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`)

        const data = await res.json()
        if (!data || typeof data.rates !== 'object' || data.rates === null) {
            throw new Error('Malformed Frankfurter response')
        }

        for (const [dateStr, dayRates] of Object.entries(data.rates)) {
            const usd = (dayRates as { USD?: number }).USD
            if (typeof usd !== 'number' || usd <= 0) continue
            const date = new Date(`${dateStr}T00:00:00.000Z`)
            await prisma.historicalPrice.upsert({
                where: { symbol_date: { symbol: FX_SYMBOL, date } },
                update: { price: usd, currency: 'USD' },
                create: { symbol: FX_SYMBOL, date, price: usd, currency: 'USD' },
            })
        }

        return { success: true }
    } catch (e) {
        console.warn('[syncFxRates] Failed to sync FX rates:', e)
        return { success: false }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fx.ts src/lib/fx.test.ts
git commit -m "feat(fx): sync daily ECB EUR/USD rates from Frankfurter into HistoricalPrice"
```

---

### Task 4: Trigger the FX sync from page loads

**Files:**
- Modify: `src/app/investments/page.tsx:34` (background sync block)
- Modify: `src/app/page.tsx` (dashboard — add fire-and-forget sync)

**Interfaces:**
- Consumes: `syncFxRates` from Task 3.
- Produces: `EURUSD=X` daily rows actually exist in the DB, so the Task 5–7 consumers have data at runtime.

- [ ] **Step 1: Wire the investments page**

In `src/app/investments/page.tsx`, add the import (server component — direct import is fine):

```ts
import { syncFxRates } from "@/lib/fx";
```

Replace line 34:

```ts
    syncHistoricalPrices([...syncSymbols, 'EURUSD=X']).catch(err => console.error("Background sync failed:", err));
```

with:

```ts
    syncHistoricalPrices(syncSymbols).catch(err => console.error("Background sync failed:", err));
    syncFxRates().catch(err => console.error("FX sync failed:", err));
```

(The old code passed `'EURUSD=X'` to `syncHistoricalPrices`, which silently dropped it — that function only syncs symbols that exist as `Asset` rows. `syncFxRates` replaces that dead path.)

- [ ] **Step 2: Wire the dashboard page**

In `src/app/page.tsx`, add the import:

```ts
import { syncFxRates } from "@/lib/fx";
```

After the `Promise.all` data fetch (after line 18, before `const uniqueSymbols`), add:

```ts
    // Background FX rate sync (one cheap HTTP call; not awaited)
    syncFxRates().catch(err => console.error("FX sync failed:", err));
```

- [ ] **Step 3: Verify end-to-end**

Run the dev server and load the dashboard once:

```bash
npm run dev &
sleep 8 && curl -s http://localhost:3000 > /dev/null && sleep 5
```

Then confirm rows exist:

```bash
sqlite3 prisma/dev.db "SELECT COUNT(*), MIN(date), MAX(date) FROM HistoricalPrice WHERE symbol='EURUSD=X';"
```

Expected: a count > 0 with dates spanning from around the first transaction date to (roughly) today. If `sqlite3` is not installed, verify via `npx prisma studio` instead (HistoricalPrice table, filter symbol `EURUSD=X`). Stop the dev server afterwards.

- [ ] **Step 4: Commit**

```bash
git add src/app/investments/page.tsx src/app/page.tsx
git commit -m "feat(fx): trigger background FX rate sync on dashboard and investments pages"
```

---

### Task 5: Per-date conversion in `getPortfolio` and `getSoldPortfolio`

**Files:**
- Modify: `src/app/actions.ts:160-321` (`getPortfolio`, `getSoldPortfolio`)
- Create: `src/app/actions.test.ts`

**Interfaces:**
- Consumes: `loadFxRates`, `convertCurrency` from Tasks 2–3.
- Produces: no signature changes — both actions return the same shapes; only the USD normalization becomes per-transaction-date.

- [ ] **Step 1: Write the failing test**

Create `src/app/actions.test.ts`. The mocks must cover everything `actions.ts` imports at module level, and `vi.mock` factories are hoisted, so fixtures use `vi.hoisted`:

```ts
import { describe, it, expect, vi } from 'vitest'

const { ASSETS, FX_ROWS } = vi.hoisted(() => {
    const FX_ROWS = [
        { date: new Date('2024-01-15T00:00:00.000Z'), price: 1.10 },
        { date: new Date('2024-06-14T00:00:00.000Z'), price: 1.08 }, // Friday
    ]
    const ASSETS = [{
        symbol: 'AAPL',
        name: 'Apple',
        type: 'STOCK',
        transactions: [
            // EUR buy on a day with an exact stored rate (1.10)
            { id: '1', assetId: 'AAPL', type: 'BUY', currency: 'EUR', quantity: 10, price: 100, date: new Date('2024-01-15T10:00:00.000Z') },
            // EUR buy on a Sunday -> nearest earlier rate (Friday, 1.08)
            { id: '2', assetId: 'AAPL', type: 'BUY', currency: 'EUR', quantity: 10, price: 100, date: new Date('2024-06-16T10:00:00.000Z') },
        ],
    }]
    return { ASSETS, FX_ROWS }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/server-services', () => ({
    yahooFinance: {
        quote: vi.fn().mockRejectedValue(new Error('offline')),
        search: vi.fn().mockRejectedValue(new Error('offline')),
        historical: vi.fn().mockRejectedValue(new Error('offline')),
    },
    getOAuthClient: vi.fn(),
    google: {},
    fs: {},
    DB_PATH: '',
}))

vi.mock('@/lib/db', () => ({
    prisma: {
        asset: {
            // getPortfolio/getSoldPortfolio query assets with a `type` filter;
            // getQuotes' DB-cache fallback queries by symbol only -> return [].
            findMany: vi.fn(async (args: any) => (args?.where?.type ? ASSETS : [])),
            upsert: vi.fn(),
        },
        setting: { findMany: vi.fn(async () => []) },
        historicalPrice: {
            findMany: vi.fn(async () => FX_ROWS),
            findFirst: vi.fn(async () => null),
        },
        transaction: {
            findFirst: vi.fn(async () => null),
            findMany: vi.fn(async () => []),
        },
    },
}))

import { getPortfolio } from '@/app/actions'

describe('getPortfolio', () => {
    it('converts each EUR transaction at the FX rate of its own date', async () => {
        const holdings = await getPortfolio()

        expect(holdings).toHaveLength(1)
        const aapl = holdings[0]
        expect(aapl.quantity).toBe(20)
        // 10 * 100 EUR * 1.10 + 10 * 100 EUR * 1.08 = 1100 + 1080 = 2180 USD
        expect(aapl.totalCost).toBeCloseTo(2180, 6)
        expect(aapl.avgCost).toBeCloseTo(109, 6)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: the new test FAILS — current code converts both buys at the live spot rate, and with all providers mocked offline the spot fetch yields nothing, so both buys use the hardcoded `1.1` (totalCost = 2200, not 2180). All fx.test.ts tests still pass.

- [ ] **Step 3: Update `getPortfolio`**

In `src/app/actions.ts`, add to the imports at the top of the file:

```ts
import { loadFxRates, convertCurrency, fxRateForDate } from '@/lib/fx'
```

(`fxRateForDate` is used in Task 7 — importing it now avoids touching the import line twice; if lint flags it as unused before Task 7, import it in Task 7 instead.)

In `getPortfolio`, replace the rate-fetch block (currently lines 175–188, from the `// 2. Fetch EURUSD exchange rate...` comment through the closing `}` of the `catch`):

```ts
    // 2. Load historical FX rates (daily ECB) + live spot as last-resort fallback
    const fxRates = await loadFxRates();
    let spotRate: number | undefined;
    try {
        const rateResult = await getQuotes(['EURUSD=X']);
        const rateQuote = rateResult['EURUSD=X'];
        if (rateQuote && rateQuote.price) spotRate = rateQuote.price;
    } catch (e) {
        console.warn("Failed to fetch live EURUSD rate; using stored historical rates", e)
    }
```

Then replace the per-transaction conversion (currently lines 197–207, the `// Normalize Price to USD` block including the `@ts-ignore` and the `if (txCurrency === 'EUR')` branch):

```ts
            // Normalize price to USD at the rate of the transaction's own date
            const txCurrency = t.currency || 'USD';
            const txPriceInUsd = convertCurrency(t.price, txCurrency, 'USD', fxRates, new Date(t.date), spotRate);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Update `getSoldPortfolio` the same way**

Replace its rate-fetch block (currently lines 252–257):

```ts
    const fxRates = await loadFxRates();
    let spotRate: number | undefined;
    try {
        const rateResult = await getQuotes(['EURUSD=X']);
        const rateQuote = rateResult['EURUSD=X'];
        if (rateQuote && rateQuote.price) spotRate = rateQuote.price;
    } catch (e) { /* rely on stored historical rates */ }
```

Replace the per-transaction conversion inside its `forEach` (currently lines 268–269):

```ts
            const txCurrency = (t.currency as string) || 'USD';
            const txPriceInUsd = convertCurrency(t.price, txCurrency, 'USD', fxRates, new Date(t.date), spotRate);
```

And the `totalInvested` reduce (currently lines 289–295) becomes:

```ts
        const totalInvested = asset.transactions
            .filter(t => t.type === 'BUY')
            .reduce((sum, t) => {
                const txCurrency = (t.currency as string) || 'USD';
                return sum + t.quantity * convertCurrency(t.price, txCurrency, 'USD', fxRates, new Date(t.date), spotRate)
            }, 0)
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "feat(fx): convert portfolio cost basis at per-transaction-date FX rates"
```

---

### Task 6: Per-date conversion in `getIncomeSummary`

**Files:**
- Modify: `src/app/actions.ts:1709-1774` (`getIncomeSummary`)
- Modify: `src/app/actions.test.ts` (append)

**Interfaces:**
- Consumes: `loadFxRates`, `convertCurrency` (already imported in Task 5).
- Produces: same return shape as before (`{ totalIncome, totalDividends, totalInterest, byMonth, bySymbol }`), amounts converted at payment date.

- [ ] **Step 1: Write the failing test**

Append to `src/app/actions.test.ts`. The transaction mock currently returns `[]` for `findMany`; give it income rows via a per-test override:

```ts
import { getIncomeSummary } from '@/app/actions'
import { prisma } from '@/lib/db'

describe('getIncomeSummary', () => {
    it('converts each income payment at the FX rate of its own date', async () => {
        vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([
            // 110 USD dividend on 2024-01-15 (rate 1.10) -> 100 EUR
            { id: 'd1', assetId: 'AAPL', type: 'DIVIDEND', currency: 'USD', quantity: 1, price: 110, date: new Date('2024-01-15T00:00:00.000Z'), asset: { name: 'Apple' } },
            // 54 USD interest on Sunday 2024-06-16 (nearest rate 1.08) -> 50 EUR
            { id: 'i1', assetId: 'TR-INTEREST', type: 'INTEREST', currency: 'USD', quantity: 1, price: 54, date: new Date('2024-06-16T00:00:00.000Z'), asset: { name: 'Trade Republic Interest' } },
        ] as any)

        const summary = await getIncomeSummary('EUR')

        expect(summary.totalDividends).toBeCloseTo(100, 6)
        expect(summary.totalInterest).toBeCloseTo(50, 6)
        expect(summary.totalIncome).toBeCloseTo(150, 6)
    })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: the new test FAILS — current code converts at the spot rate (falls back to `1.1` here), giving `110 / 1.1 = 100` for the dividend (coincidentally right) but `54 / 1.1 = 49.09...` for the interest, so `totalInterest` misses 50.

- [ ] **Step 3: Update `getIncomeSummary`**

Replace the rate-fetch block and the local `convert` helper (currently lines 1720–1732):

```ts
    const fxRates = await loadFxRates()
    let spotRate: number | undefined
    try {
        const rateResult = await getQuotes(['EURUSD=X'])
        const rateQuote = rateResult['EURUSD=X']
        if (rateQuote && rateQuote.price) spotRate = rateQuote.price
    } catch (e) { /* rely on stored historical rates */ }
```

And in the `for (const t of incomeTxs)` loop, replace:

```ts
        const amount = convert(t.quantity * t.price, t.currency || 'EUR')
```

with:

```ts
        const amount = convertCurrency(t.quantity * t.price, t.currency || 'EUR', targetCurrency, fxRates, new Date(t.date), spotRate)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "feat(fx): convert income at per-payment-date FX rates"
```

---

### Task 7: Historical FX in `getPortfolioPerformance`

**Files:**
- Modify: `src/app/actions.ts:1778-1852` (`getPortfolioPerformance`)

**Interfaces:**
- Consumes: `loadFxRates`, `fxRateForDate` (imported in Task 5).
- Produces: same return shape (`{ performance: [...] }`); month-end FX now comes from stored daily rates with nearest-earlier fallback instead of a hardcoded `1.1`.

There is no new unit test for this task — the FX lookup itself is covered by `fx.test.ts`, and this change only swaps the rate source inside an existing calculation. Verification is via the existing suite plus the manual check in Task 8.

- [ ] **Step 1: Load FX rates and drop `EURUSD=X` from the history query**

In `getPortfolioPerformance`, replace the history query (currently lines 1791–1795):

```ts
    // 2. Fetch ALL Historical Prices (FX rates come from loadFxRates below)
    const history = await prisma.historicalPrice.findMany({
        where: { symbol: { in: symbols } },
        orderBy: { date: 'asc' }
    });
    const fxRates = await loadFxRates();
```

- [ ] **Step 2: Replace `getExchangeRateToTarget`**

Replace the whole helper (currently lines 1830–1852, including its comment block) with:

```ts
    // Helper: Get XR (Exchange Rate to Target) at a given date.
    // EURUSD (USD per 1 EUR) comes from stored daily ECB rates with
    // nearest-earlier fallback for weekends/holidays.
    const getExchangeRateToTarget = (assetCurrency: string, date: Date): number => {
        if (assetCurrency === targetCurrency) return 1;
        const eurusd = fxRateForDate(fxRates, date);
        if (targetCurrency === 'EUR' && assetCurrency === 'USD') return 1 / eurusd;
        if (targetCurrency === 'USD' && assetCurrency === 'EUR') return eurusd;
        return 1; // Unknown pair
    };
```

- [ ] **Step 3: Update the call site**

Inside the monthly loop (currently line 1869), change:

```ts
            const xr = getExchangeRateToTarget(assetCurrency, monthEndStr);
```

to:

```ts
            const xr = getExchangeRateToTarget(assetCurrency, monthEnd);
```

- [ ] **Step 4: Run the suite and the linter**

Run: `npm test && npm run lint`
Expected: all tests PASS; no new lint errors (in particular, `fxRateForDate` is now used, so the Task 5 import is clean).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(fx): use historical ECB rates in portfolio performance instead of hardcoded 1.1"
```

---

### Task 8: Docs, full verification, and end-to-end check

**Files:**
- Modify: `CLAUDE.md` (Commands + Architecture sections)

**Interfaces:**
- Consumes: everything above.
- Produces: documented, verified feature.

- [ ] **Step 1: Update CLAUDE.md**

In the **Commands** section, add after the lint entry:

```markdown
# Run tests (Vitest)
npm test
```

and delete the line `There are no automated tests in this project.` — replace it with:

```markdown
Tests use Vitest (`npm test`); they live next to the code as `*.test.ts` files under `src/`.
```

In the **Data Layer** section, add a bullet:

```markdown
- **`src/lib/fx.ts`** — historical EUR/USD FX rates: daily ECB rates synced from the Frankfurter API into `HistoricalPrice` (symbol `EURUSD=X`, price = USD per 1 EUR), plus `convertCurrency`/`fxRateForDate` lookup helpers used by every currency-converting server action. Synced fire-and-forget on `/` and `/investments` page loads.
```

- [ ] **Step 2: Full verification**

Run:

```bash
npm test && npm run lint && npm run build
```

Expected: tests pass, lint clean, production build succeeds.

- [ ] **Step 3: End-to-end sanity check**

Start the dev server, load `/`, `/investments`, and `/investments?currency=USD` in a browser (or `curl -s ... | grep -c html`). Confirm:
- Pages render without errors.
- Server log shows no `[syncFxRates]` warnings after first load.
- Portfolio totals and the income summary show plausible values (they may shift slightly versus before — that is the fix working).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document FX rate module and test commands"
```
