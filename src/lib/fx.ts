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
