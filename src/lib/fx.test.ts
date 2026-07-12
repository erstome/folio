import { describe, it, expect } from 'vitest'
import type { TransactionData } from '@/app/types'
import { buildFxRates, fxRateForDate, convertCurrency } from '@/lib/fx'

describe('test infrastructure', () => {
    it('resolves the @/ path alias', () => {
        const tx: Partial<TransactionData> = { symbol: 'AAPL' }
        expect(tx.symbol).toBe('AAPL')
    })
})

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
