export type TransactionData = {
    symbol: string
    type: 'BUY' | 'SELL' | 'DIVIDEND' | 'INTEREST' | 'DEPOSIT'
    quantity: number
    price: number
    currency?: string
    date: Date
    assetName?: string | null
}

export type DepositData = {
    amount: number
    bankName: string
    name?: string
    currency: string
    interestRate: number
    startDate: Date
    maturityDate: Date
}

export type PensionData = {
    name: string
    currentValue: number
    quantity: number
    investedAmount: number
    currency: string
    isTaxAdvantaged: boolean
}

export type Holding = {
    symbol: string
    name: string
    quantity: number
    avgCost: number
    totalCost: number
    currentPrice?: number
    marketValue?: number
    gain?: number
    gainPercent?: number
    lastUpdate?: Date | string | null
    isCached?: boolean
}
