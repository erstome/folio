import { describe, it, expect } from 'vitest'
import type { TransactionData } from '@/app/types'

describe('test infrastructure', () => {
    it('resolves the @/ path alias', () => {
        const tx: Partial<TransactionData> = { symbol: 'AAPL' }
        expect(tx.symbol).toBe('AAPL')
    })
})
