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
