import * as XLSX from 'xlsx'

export interface XTBTransaction {
    date: Date
    type: 'BUY' | 'SELL' | 'DIVIDEND'
    description: string
    symbol: string
    quantity: number
    amount: number
    currency: string
    assetName?: string
}

function excelSerialToDate(serial: number): Date {
    // Excel epoch is Dec 30, 1899; 25569 days to Unix epoch (Jan 1, 1970)
    return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

function parseComment(comment: string): { quantity: number; price: number } | null {
    // Handles full fills ("OPEN BUY 10 @ 5.00") and partial fills ("OPEN BUY 9/10 @ 5.31")
    const match = comment.match(/(?:OPEN|CLOSE)\s+(?:BUY|SELL)\s+([\d.,]+)(?:\/[\d.,]+)?\s*@\s*([\d.,]+)/i)
    if (!match) return null
    const quantity = parseFloat(match[1].replace(',', '.'))
    const price = parseFloat(match[2].replace(',', '.'))
    if (isNaN(quantity) || isNaN(price) || quantity <= 0 || price <= 0) return null
    return { quantity, price }
}

export function parseXTBStatement(buffer: Buffer): XTBTransaction[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const sheetName = 'Cash Operations'
    const ws = workbook.Sheets[sheetName]
    if (!ws) {
        throw new Error(`Sheet "${sheetName}" not found in workbook`)
    }

    // header:1 returns arrays; rows 0-4 are metadata + column headers, data starts at index 5
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

    const transactions: XTBTransaction[] = []
    // Dividend rows are paired with separate "Withholding tax" rows (same
    // ticker + day); collect both and emit one net DIVIDEND per pair.
    const dividends: { date: Date; ticker: string; instrument: string; amount: number }[] = []
    const withholdingTaxes: { date: Date; ticker: string; amount: number }[] = []

    for (const rawRow of rows.slice(5)) {
        const row = rawRow as unknown[]
        const type = String(row[0] ?? '').trim()
        const ticker = String(row[1] ?? '').trim()
        const instrument = String(row[2] ?? '').trim()
        const timeRaw = row[3]
        const amountRaw = row[4]
        const comment = String(row[6] ?? '').trim()

        const isTradeRow = type === 'Stock purchase' || type === 'Stock sale'
        const isDividendRow = /^divid/i.test(type) // XTB uses both "Dividend" and "DIVIDENT"
        const isTaxRow = /^withholding tax$/i.test(type)
        if (!isTradeRow && !isDividendRow && !isTaxRow) continue
        if (!ticker) continue

        const rawAmount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw))
        if (!rawAmount || isNaN(rawAmount)) continue

        let date: Date
        if (typeof timeRaw === 'number') {
            date = excelSerialToDate(timeRaw)
        } else if (timeRaw instanceof Date) {
            date = timeRaw
        } else {
            continue
        }

        if (isDividendRow) {
            dividends.push({ date, ticker: ticker.toUpperCase(), instrument, amount: Math.abs(rawAmount) })
            continue
        }
        if (isTaxRow) {
            withholdingTaxes.push({ date, ticker: ticker.toUpperCase(), amount: Math.abs(rawAmount) })
            continue
        }

        const txType: 'BUY' | 'SELL' = type === 'Stock purchase' ? 'BUY' : 'SELL'
        const amount = Math.abs(rawAmount)

        const parsed = parseComment(comment)
        if (!parsed) continue

        transactions.push({
            date,
            type: txType,
            description: instrument || ticker,
            symbol: ticker.toUpperCase(),
            quantity: parsed.quantity,
            amount,
            currency: 'EUR',
            assetName: instrument || undefined,
        })
    }

    // Net each dividend against its withholding tax (matched by ticker + calendar day)
    const sameDay = (a: Date, b: Date) => a.toISOString().split('T')[0] === b.toISOString().split('T')[0]
    for (const div of dividends) {
        const taxIdx = withholdingTaxes.findIndex(t => t.ticker === div.ticker && sameDay(t.date, div.date))
        const tax = taxIdx >= 0 ? withholdingTaxes.splice(taxIdx, 1)[0].amount : 0
        const net = div.amount - tax
        if (net <= 0) continue

        transactions.push({
            date: div.date,
            type: 'DIVIDEND',
            description: `Dividend ${div.instrument || div.ticker}`,
            symbol: div.ticker,
            quantity: 1,
            amount: net,
            currency: 'EUR',
            assetName: div.instrument || undefined,
        })
    }

    return transactions
}
