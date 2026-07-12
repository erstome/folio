// Historical EUR/USD FX rates.
// Rates are stored in the HistoricalPrice table under symbol 'EURUSD=X'
// with price = USD per 1 EUR (matching the Yahoo EURUSD=X convention
// already assumed by getPortfolioPerformance).

import { prisma } from '@/lib/db'

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
