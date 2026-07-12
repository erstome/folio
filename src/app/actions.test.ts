import { describe, it, expect, vi } from 'vitest'

const { ASSETS } = vi.hoisted(() => {
    // Regression fixture: the second BUY lands on the LAST day of April at 07:56,
    // after midnight — monthly loops that treat month-end as midnight drop it.
    const ASSETS = [{
        symbol: 'TEST.MC',
        name: 'Test Asset',
        type: 'STOCK',
        lastPrice: 100,
        lastCurrency: 'EUR',
        lastUpdate: new Date('2026-07-12T00:00:00.000Z'),
        transactions: [
            { id: '1', assetId: 'TEST.MC', type: 'BUY', currency: 'EUR', quantity: 5, price: 100, date: new Date('2026-04-15T10:00:00.000Z') },
            { id: '2', assetId: 'TEST.MC', type: 'BUY', currency: 'EUR', quantity: 10, price: 100, date: new Date('2026-04-30T07:56:00.000Z') },
        ],
    }]
    return { ASSETS }
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
            findUnique: vi.fn(async () => ({ ...ASSETS[0], transactions: [...ASSETS[0].transactions] })),
            // Portfolio queries filter by `type`; getQuotes' DB-cache fallback queries
            // by symbol only -> return [] so quote fetching stays inert in tests.
            findMany: vi.fn(async (args: any) => (args?.where?.type ? ASSETS.map(a => ({ ...a, transactions: [...a.transactions] })) : [])),
            upsert: vi.fn(),
        },
        setting: { findMany: vi.fn(async () => []) },
        historicalPrice: {
            findMany: vi.fn(async () => []),
            findFirst: vi.fn(async () => null),
        },
        transaction: {
            findFirst: vi.fn(async () => null),
            findMany: vi.fn(async () => []),
        },
    },
}))

import { getAssetDetails, getPortfolioPerformance } from '@/app/actions'

describe('getAssetDetails', () => {
    it('counts transactions on the last day of a month', async () => {
        const details = await getAssetDetails('TEST.MC')

        expect(details).not.toBeNull()
        // 5 + 10 shares; the Apr 30 buy must not fall into a month-boundary gap
        expect(details!.stats.currentHoldings).toBe(15)
        // invested 15 * 100, valued at lastPrice 100 -> zero lifetime gain
        expect(details!.stats.totalLifetimeGain).toBeCloseTo(0, 6)
        // newest table row must agree with the lifetime stats
        expect(details!.performance[0].cumulativeInvested).toBeCloseTo(1500, 6)
        expect(details!.performance[0].cumulativeGain).toBeCloseTo(0, 6)
    })
})

describe('getPortfolioPerformance', () => {
    it('counts transactions on the last day of a month', async () => {
        const result = await getPortfolioPerformance('EUR')

        expect(result.performance.length).toBeGreaterThan(0)
        // newest row first; cumulative invested must include the Apr 30 buy
        expect(result.performance[0].cumulativeInvested).toBeCloseTo(1500, 6)
    })
})
