import * as XLSX from 'xlsx'

export interface XTBTransaction {
    date: Date
    type: 'BUY' | 'SELL'
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

    for (const rawRow of rows.slice(5)) {
        const row = rawRow as unknown[]
        const type = String(row[0] ?? '').trim()
        const ticker = String(row[1] ?? '').trim()
        const instrument = String(row[2] ?? '').trim()
        const timeRaw = row[3]
        const amountRaw = row[4]
        const comment = String(row[6] ?? '').trim()

        if (type !== 'Stock purchase' && type !== 'Stock sale') continue
        if (!ticker) continue

        const txType: 'BUY' | 'SELL' = type === 'Stock purchase' ? 'BUY' : 'SELL'
        const rawAmount = typeof amountRaw === 'number' ? amountRaw : parseFloat(String(amountRaw))
        const amount = Math.abs(rawAmount)
        if (!amount || isNaN(amount)) continue

        let date: Date
        if (typeof timeRaw === 'number') {
            date = excelSerialToDate(timeRaw)
        } else if (timeRaw instanceof Date) {
            date = timeRaw
        } else {
            continue
        }

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

    return transactions
}
