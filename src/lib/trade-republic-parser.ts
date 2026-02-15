export interface TradeRepublicTransaction {
  date: Date
  type: 'BUY' | 'SELL' | 'INTEREST' | 'DIVIDEND' | 'TRANSFER' | 'OTHER'
  description: string
  amount: number // Positive for money in, negative for money out
  currency: string
  symbol?: string // ISIN code for trades
  quantity?: number
  assetName?: string
}

/**
 * Parse Trade Republic bank statement PDF
 */
export async function parseTradeRepublicStatement(pdfBuffer: Buffer): Promise<TradeRepublicTransaction[]> {
  // pdf-parse v2 uses a class-based API
  const pdfParseModule = eval('require')('pdf-parse')
  const PDFParse = pdfParseModule.PDFParse || pdfParseModule
  
  // Create parser instance with buffer
  const parser = new PDFParse({ data: pdfBuffer })
  
  // Get text content
  const result = await parser.getText()
  const text = result.text
  
  const transactions: TradeRepublicTransaction[] = []
  
  // Split by lines
  const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
  
  // Find the transaction table section
  let headerLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('DATE') && lines[i].includes('TYPE') && lines[i].includes('DESCRIPTION')) {
      headerLineIndex = i
      break
    }
  }
  
  if (headerLineIndex === -1) {
    return transactions // No transaction table found
  }
  
  // Process transactions starting after the header
  // Dates are split across lines: "DD MMM" on one line, "YYYY" on next
  // Descriptions can also span multiple lines
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    
    // Stop at summary sections or page breaks
    if (line.includes('BALANCE OVERVIEW') || line.includes('ACCOUNT STATEMENT SUMMARY') || line.match(/^\d+ of \d+$/)) {
      break
    }
    
    // Check if this line starts with a date part (DD MMM)
    const dateStartMatch = line.match(/^(\d{1,2})\s+([A-Za-z]{3})$/)
    if (dateStartMatch) {
      // Next line should have the year and transaction details
      if (i + 1 < lines.length) {
        const [, day, month] = dateStartMatch
        let year = ''
        let transactionParts: string[] = []
        let j = i + 1
        
        // Get the year from the next line
        if (j < lines.length) {
          const yearLine = lines[j]
          const yearMatch = yearLine.match(/^(\d{4})(?:\s+(.+))?$/)
          if (yearMatch) {
            year = yearMatch[1]
            if (yearMatch[2]) {
              transactionParts.push(yearMatch[2])
            }
            j++
          } else {
            continue // Invalid format, skip
          }
        }
        
        // Continue collecting lines until we find amounts (€) or another date
        while (j < lines.length) {
          const nextLine = lines[j]
          // Stop if we hit another date or summary section
          if (nextLine.match(/^\d{1,2}\s+[A-Za-z]{3}$/) || 
              nextLine.includes('BALANCE OVERVIEW') || 
              nextLine.includes('ACCOUNT STATEMENT SUMMARY')) {
            break
          }
          
          transactionParts.push(nextLine)
          
          // If this line has amounts (€), we're done collecting
          if (nextLine.includes('€')) {
            j++
            break
          }
          
          j++
        }
        
        // Combine all transaction parts
        const fullLine = `${day} ${month} ${year} ${transactionParts.join(' ')}`
        const tx = parseTransactionLine(fullLine, day, month, year)
        if (tx) {
          transactions.push(tx)
        }
        
        // Skip all the lines we processed
        i = j - 1
      }
    }
  }
  
  return transactions
}

/**
 * Parse a single transaction line from Trade Republic statement
 */
function parseTransactionLine(line: string, day?: string, month?: string, year?: string): TradeRepublicTransaction | null {
  let parsedDay: string
  let parsedMonth: string
  let parsedYear: string
  
  if (day && month && year) {
    // Date parts already extracted
    parsedDay = day
    parsedMonth = month
    parsedYear = year
    // Remove date from line if it's there
    const datePrefix = `${day} ${month} ${year}`
    line = line.startsWith(datePrefix) ? line.substring(datePrefix.length).trim() : line
  } else {
    // Try to match date pattern at start: "DD MMM YYYY"
    const dateMatch = line.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
    if (!dateMatch) return null
    parsedDay = dateMatch[1]
    parsedMonth = dateMatch[2]
    parsedYear = dateMatch[3]
    // Remove date part
    line = line.substring(dateMatch[0].length).trim()
  }
  
  const monthMap: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  }
  
  const date = new Date(parseInt(parsedYear), monthMap[parsedMonth] || 0, parseInt(parsedDay))
  
  // Get remaining part (should already be trimmed if date was pre-extracted)
  const remaining = line
  
  // Extract type (usually single word after date: "Trade", "Transfer", "Interest")
  const typeMatch = remaining.match(/^([A-Za-z]+)\s+(.+)$/)
  if (!typeMatch) return null
  
  const typeStr = typeMatch[1].trim()
  const rest = typeMatch[2].trim()
  
  // For Trade transactions, determine BUY/SELL from the details
  let type: TradeRepublicTransaction['type']
  let symbol: string | undefined
  let quantity: number | undefined
  let assetName: string | undefined
  let amount = 0
  const currency = 'EUR'
  
  if (typeStr.toLowerCase() === 'trade') {
    // Format: "Buy trade ISIN Asset Name, quantity: X.XX €Amount.XX €Balance.XX"
    // or: "Savings plan execution ISIN Asset Name, quantity: X.XX €Amount.XX €Balance.XX"
    // or: "Sell trade ISIN Asset Name, quantity: X.XX €Amount.XX €Balance.XX"
    
    // Determine if BUY or SELL and extract trade details (remove prefix)
    let tradeDetails = rest
    if (rest.match(/^Buy trade\s+/i)) {
      type = 'BUY'
      tradeDetails = rest.replace(/^Buy trade\s+/i, '')
    } else if (rest.match(/^Savings plan execution\s+/i)) {
      type = 'BUY'
      tradeDetails = rest.replace(/^Savings plan execution\s+/i, '')
    } else if (rest.match(/^Sell trade\s+/i)) {
      type = 'SELL'
      tradeDetails = rest.replace(/^Sell trade\s+/i, '')
    } else {
      return null // Unknown trade type
    }
    
    // Extract ISIN (12 characters: 2 letters + 9 alphanumeric + 1 digit)
    const isinMatch = tradeDetails.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/)
    if (!isinMatch) return null // ISIN is required for trades
    symbol = isinMatch[1]
    
    // Extract quantity (after "quantity:")
    const qtyMatch = tradeDetails.match(/quantity:\s*([\d,]+\.?\d*)/i)
    if (!qtyMatch) return null // Quantity is required
    quantity = parseFloat(qtyMatch[1].replace(/,/g, ''))
    
    // Extract asset name (between ISIN and "quantity:")
    const isinEnd = isinMatch.index! + isinMatch[0].length
    const qtyStart = qtyMatch.index!
    const extractedName = tradeDetails.substring(isinEnd, qtyStart).trim()
    // Clean up asset name (remove extra spaces, trailing commas)
    assetName = extractedName ? extractedName.replace(/,\s*$/, '').trim() : undefined
    
    // Extract amounts (€X.XX format) - there should be 2: transaction amount and balance
    const amounts = tradeDetails.match(/€([\d,]+\.?\d*)/g)
    if (!amounts || amounts.length < 1) return null
    
    // The transaction amount is the second-to-last amount (last is balance)
    // Format: "..., quantity: X.XX €Amount.XX €Balance.XX"
    const transactionAmountStr = amounts[amounts.length >= 2 ? amounts.length - 2 : amounts.length - 1]
    amount = parseFloat(transactionAmountStr.replace(/[€,]/g, ''))
  } else {
    // Non-trade transactions
    type = mapTradeRepublicType(typeStr)
    // For non-trade transactions (Transfer, Interest, etc.)
    // Extract amounts
    const amounts = rest.match(/€([\d,]+\.?\d*)/g)
    if (amounts && amounts.length > 0) {
      // Last amount is balance, second-to-last is transaction amount
      const transactionAmountStr = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0]
      amount = parseFloat(transactionAmountStr.replace(/[€,]/g, ''))
      
      // Determine sign based on type
      if (type === 'INTEREST' || type === 'DIVIDEND') {
        amount = Math.abs(amount) // Positive for income
      } else if (rest.includes('PayOut')) {
        amount = -Math.abs(amount) // Negative for payouts
      }
    }
  }
  
  // Extract description (everything before amounts, or use asset name for trades)
  const description = type === 'BUY' || type === 'SELL' 
    ? `${typeStr} ${symbol} ${assetName || ''}`.trim()
    : rest.split('€')[0].trim()
  
  return {
    date,
    type,
    description,
    amount,
    currency,
    symbol,
    quantity,
    assetName
  }
}

/**
 * Map Trade Republic transaction type to our internal type
 */
function mapTradeRepublicType(typeStr: string): TradeRepublicTransaction['type'] {
  const normalized = typeStr.toLowerCase()
  
  if (normalized === 'trade') {
    // For "Trade" type, we need to check the transaction details to determine BUY/SELL
    // This will be handled in parseTransactionLine by checking "Buy trade", "Sell trade", "Savings plan execution"
    return 'BUY' // Default, will be corrected in parseTransactionLine
  }
  
  if (normalized.includes('interest')) {
    return 'INTEREST'
  }
  
  if (normalized.includes('dividend') || normalized.includes('earnings')) {
    return 'DIVIDEND'
  }
  
  if (normalized.includes('transfer')) {
    return 'TRANSFER'
  }
  
  return 'OTHER'
}

/**
 * Use ISIN directly - Yahoo Finance supports ISIN lookups for most securities
 * No conversion needed, we'll store and query using ISIN
 */
export function isinToSymbol(isin: string): string {
  // Use ISIN directly - Yahoo Finance supports ISIN lookups
  // This is more robust than maintaining a mapping table
  return isin
}

