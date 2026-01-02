'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import path from 'path'
import { TransactionData, DepositData, PensionData } from './types'
import { yahooFinance, getOAuthClient, google, fs, DB_PATH } from '@/lib/server-services'

// --- Settings Actions ---

export async function getSettings() {
    const settings = await prisma.setting.findMany()
    return settings.reduce((acc: Record<string, string>, curr: { key: string, value: string }) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
}

export async function updateSettings(data: Record<string, string>) {
    for (const [key, value] of Object.entries(data)) {
        await prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        })
    }
    revalidatePath('/')
    return { success: true }
}

async function getCloudCredentials() {
    const settings = await getSettings()
    return {
        clientId: settings.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        clientSecret: settings.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
        baseUrl: settings.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL
    }
}

export async function addTransaction(data: TransactionData) {
    const { symbol, type, quantity, price, date, currency = 'USD' } = data
    const upperSymbol = symbol.toUpperCase()

    // 0. Try to fetch real name if new asset
    let assetName = upperSymbol
    try {
        const quote = await yahooFinance.quote(upperSymbol)
        if (quote && (quote.longName || quote.shortName)) {
            assetName = quote.longName || quote.shortName || upperSymbol
        }
    } catch (e) {
        console.warn("Failed to fetch name for new asset", e)
    }

    // 1. Upsert Asset
    await prisma.asset.upsert({
        where: { symbol: upperSymbol },
        update: {},
        create: {
            symbol: upperSymbol,
            name: assetName,
        },
    })

    // 2. Create Transaction
    await prisma.transaction.create({
        data: {
            assetId: upperSymbol,
            type,
            quantity,
            price,
            currency,
            date,
        },
    })

    revalidatePath('/')
    return { success: true }
}

export async function updateTransaction(id: string, data: TransactionData) {
    const { symbol, type, quantity, price, date, currency = 'USD' } = data
    const upperSymbol = symbol.toUpperCase()

    // 1. Ensure Asset exists (in case symbol changed)
    await prisma.asset.upsert({
        where: { symbol: upperSymbol },
        update: {},
        create: {
            symbol: upperSymbol,
            name: upperSymbol,
        },
    })

    // 2. Update Transaction
    await prisma.transaction.update({
        where: { id },
        data: {
            assetId: upperSymbol,
            type,
            quantity,
            price,
            currency,
            date,
        },
    })

    revalidatePath('/')
    return { success: true }
}

export async function getTransactions() {
    const transactions = await prisma.transaction.findMany({
        orderBy: { date: 'desc' },
        take: 10,
        include: {
            asset: {
                select: { name: true }
            }
        }
    })

    return transactions.map(t => ({
        ...t,
        symbol: t.assetId,
        assetName: t.asset.name
    }))
}

export async function getPortfolio() {
    // 1. Fetch Assets with Transactions (Stocks/Crypto/ETF only)
    const assets = await prisma.asset.findMany({
        where: {
            type: {
                in: ['STOCK', 'ETF', 'CRYPTO']
            }
        },
        include: {
            transactions: {
                orderBy: { date: 'asc' },
            },
        },
    })

    // 2. Fetch EURUSD exchange rate for normalization (Rough approximation: use current rate)
    // Ideally use historical rates, but for MVP current rate is acceptable fallback.
    // 'EUR=X' is approx USD/EUR or EUR/USD. Let's check getQuotes output from previous step.
    // Actually, let's fetch it.
    let eurUsdRate = 1.1; // Sensible default
    try {
        const rateResult = await getQuotes(['EURUSD=X']);
        const rateQuote = rateResult['EURUSD=X'];
        if (rateQuote && rateQuote.price) {
            eurUsdRate = rateQuote.price;
        }
    } catch (e) {
        console.warn("Failed to fetch exchange rate via getQuotes, using fallback 1.1", e)
    }

    // Calculate holdings
    const holdings = assets.map((asset) => {
        let quantity = 0
        let totalCost = 0 // In USD

        asset.transactions.forEach((t) => {
            // Normalize Price to USD
            // @ts-ignore
            const txCurrency = t.currency || 'USD';
            let txPriceInUsd = t.price;

            if (txCurrency === 'EUR') {
                // t.price is in EUR.
                // eurUsdRate is USD per EUR (1.17).
                // USD = EUR * Rate
                txPriceInUsd = t.price * eurUsdRate;
            }

            if (t.type === 'BUY') {
                quantity += t.quantity
                totalCost += t.quantity * txPriceInUsd
            } else {
                // Simple FIFO/Average cost logic implies reducing cost basis proportionally?
                // For MVP simplified: reduce quantity, keep avg cost the same, or reduce totalCost proportionally.
                // Let's use Average Cost Basis method:
                // Selling reduces totalCost by (quantitySold * avgCost)
                if (quantity > 0) {
                    const avgCost = totalCost / quantity
                    quantity -= t.quantity
                    totalCost -= (t.quantity * avgCost)
                } else {
                    // Short selling logic or error state, handle gracefully
                    quantity -= t.quantity
                    // If shorting, cost logic gets complex. MVP assumes long only or basic math.
                }
            }
        })

        return {
            symbol: asset.symbol,
            name: asset.name || asset.symbol,
            quantity,
            avgCost: quantity > 0 ? totalCost / quantity : 0, // In USD
            totalCost, // In USD
        }
    }).filter((h: any) => h.quantity > 0) // Filter out fully sold assets for now

    return holdings
}

// Helper for FMP
// Helper for Twelvedata
async function fetchTwelvedataQuotes(symbols: string[], apiKey: string) {
    // Twelvedata batch: symbol=AAPL,MSFT,EUR/USD
    // Need to handle different ticker formats if necessary, but try direct first.
    // Twelvedata Rate Limit (Free): 8 requests/minute, 800/day. Batches count as 1 request!
    const url = `https://api.twelvedata.com/quote?symbol=${symbols.join(',')}&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Twelvedata API Error: ${response.statusText}`);
    }
    const data = await response.json();
    // Twelvedata returns object { "AAP": {...}, "MSFT": {...} } OR single object if 1 symbol { symbol: "..." }
    // If error in batch: { "code": 400, "message": "..." }
    if (data.code && data.code !== 200) throw new Error(data.message);

    // Normalize to array
    if (data.symbol) return [data]; // Single result
    return Object.values(data); // Batch result
}

// Helper for FMP (Re-added for testing)
async function fetchFMPQuotes(symbols: string[], apiKey: string) {
    const url = `https://financialmodelingprep.com/api/v3/quote/${symbols.join(',')}?apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
        // Log explicitly to help user debug permissions
        const errorBody = await response.text();
        console.error(`[fetchFMPQuotes] Error: ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`FMP API Error: ${response.statusText} - ${errorBody}`);
    }
    const data = await response.json();
    return data;
}

// Simple In-Memory Cache (Global on Server)
// Key: Symbol, Value: { price, data, timestamp }
const QUOTE_CACHE: Record<string, { price: number, data: any, timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 Minutes

export async function getQuotes(symbols: string[]) {
    if (symbols.length === 0) return {}

    const now = Date.now();
    const uniqueSymbols = Array.from(new Set(symbols)); // De-dupe input
    const results: any = {};
    const missingSymbols: string[] = [];

    // 1. Check Cache First
    for (const sym of uniqueSymbols) {
        const cached = QUOTE_CACHE[sym];
        if (cached && (now - cached.timestamp < CACHE_TTL)) {
            results[sym] = cached.data;
            // console.log(`[getQuotes] Cache hit for ${sym}`);
        } else {
            missingSymbols.push(sym);
        }
    }

    if (missingSymbols.length === 0) {
        return results;
    }

    console.log(`[getQuotes] Fetching fresh quotes for: ${missingSymbols.join(', ')}`)

    // Helper to update specific symbol cache safely
    const updateSymbolCache = async (symbol: string, data: any) => {
        // Update In-Memory Cache
        QUOTE_CACHE[symbol] = {
            price: data.price,
            data: data,
            timestamp: Date.now()
        };
        // Update DB Cache (Safe Upsert)
        try {
            await prisma.asset.upsert({
                where: { symbol: symbol },
                update: {
                    lastPrice: data.price,
                    lastCurrency: data.currency,
                    lastUpdate: new Date()
                },
                create: {
                    symbol: symbol,
                    name: data.name || symbol,
                    type: 'STOCK', // Default fallback
                    lastPrice: data.price,
                    lastCurrency: data.currency,
                    lastUpdate: new Date()
                }
            });
        } catch (e) {
            console.error(`[getQuotes] DB Cache update failed for ${symbol}`, e);
        }
    };

    // 2. Try Twelvedata if Key exists
    const settings = await getSettings();
    let symbolsToFetch = [...missingSymbols];

    if (settings.TWELVEDATA_API_KEY && symbolsToFetch.length > 0) {
        try {
            console.log('[getQuotes] Using Twelvedata API');
            const tdResults = await fetchTwelvedataQuotes(symbolsToFetch, settings.TWELVEDATA_API_KEY);

            const fetchedSymbols = new Set<string>();

            for (const q of tdResults) {
                if (q && q.symbol) {
                    const price = parseFloat(q.close) || parseFloat(q.rate) || 0;
                    const change = parseFloat(q.change) || 0;
                    const changeP = parseFloat(q.percent_change) || 0;

                    const quoteData = {
                        price: price,
                        currency: q.currency || 'USD',
                        change: change,
                        changePercent: changeP,
                        name: q.name || q.symbol,
                        lastUpdate: new Date(),
                        isCached: false
                    };

                    results[q.symbol] = quoteData;
                    await updateSymbolCache(q.symbol, quoteData);
                    fetchedSymbols.add(q.symbol);
                }
            }
            // Remove fetched from list
            symbolsToFetch = symbolsToFetch.filter(s => !fetchedSymbols.has(s));

        } catch (e: any) {
            console.error('[getQuotes] Twelvedata failed, falling back to Next:', e.message);
        }
    }

    // 3. Try FMP if Key exists and still have missing symbols
    if (settings.FMP_API_KEY && symbolsToFetch.length > 0) {
        try {
            console.log('[getQuotes] Using FMP API');
            const fmpResults = await fetchFMPQuotes(symbolsToFetch, settings.FMP_API_KEY);

            const fetchedSymbols = new Set<string>();

            for (const q of fmpResults) {
                if (q && q.symbol) {
                    const quoteData = {
                        price: q.price,
                        currency: q.currency || 'USD',
                        change: q.change,
                        changePercent: q.changesPercentage,
                        name: q.name,
                        lastUpdate: new Date(),
                        isCached: false
                    };
                    results[q.symbol] = quoteData;
                    await updateSymbolCache(q.symbol, quoteData);
                    fetchedSymbols.add(q.symbol);
                }
            }
            symbolsToFetch = symbolsToFetch.filter(s => !fetchedSymbols.has(s));

        } catch (e: any) {
            console.error('[getQuotes] FMP failed, falling back to Yahoo:', e.message);
        }
    }

    // 4. Fallback to Yahoo for remaining
    if (symbolsToFetch.length > 0) {
        try {
            const result = await yahooFinance.quote(symbolsToFetch)
            const quotes = Array.isArray(result) ? result : [result]

            for (const q of quotes) {
                if (q && (q.regularMarketPrice || q.currentPrice)) {
                    const price = q.regularMarketPrice || q.currentPrice || 0;
                    const quoteData = {
                        price: price,
                        currency: q.currency,
                        change: q.regularMarketChange || 0,
                        changePercent: q.regularMarketChangePercent || 0,
                        name: q.longName || q.shortName || q.symbol,
                        lastUpdate: new Date(),
                        isCached: false
                    }
                    results[q.symbol] = quoteData;
                    await updateSymbolCache(q.symbol, quoteData);
                }
            }
        } catch (error: any) {
            console.error("[getQuotes] Yahoo failed:", error.message)
            // Final fallback: Return from DB if absolutely nothing else worked
            try {
                const cachedAssets = await prisma.asset.findMany({
                    where: { symbol: { in: symbolsToFetch } },
                    select: { symbol: true, lastPrice: true, lastCurrency: true, lastUpdate: true, name: true }
                })
                for (const asset of cachedAssets) {
                    if (asset.lastPrice) {
                        results[asset.symbol] = {
                            price: asset.lastPrice,
                            currency: asset.lastCurrency || 'USD',
                            change: 0,
                            changePercent: 0,
                            name: asset.name || asset.symbol,
                            lastUpdate: asset.lastUpdate,
                            isCached: true
                        }
                    }
                }
            } catch (e) { }
        }
    }

    return results;
}

export async function updateAssetName(symbol: string, name: string) {
    try {
        await prisma.asset.update({
            where: { symbol },
            data: { name }
        })
        return { success: true }
    } catch (e) {
        console.error("Failed to update asset name", e)
        return { success: false }
    }
}

export async function updateDeposit(assetId: string, data: DepositData) {
    // 1. Update Asset fields
    await prisma.asset.update({
        where: { symbol: assetId },
        data: {
            name: data.name,
            interestRate: data.interestRate,
            maturityDate: data.maturityDate,
            bankName: data.bankName,
        }
    })

    // 2. Update the initial transaction amount if it changed
    // In a real app, we might handle this differently (e.g. separate transactions), 
    // but for this MVP, we assume one transaction per deposit.
    const asset = await prisma.asset.findUnique({
        where: { symbol: assetId },
        include: { transactions: true }
    })

    if (asset && asset.transactions.length > 0) {
        const tx = asset.transactions[0]

        // Update Start Date and/or Amount
        // We always update to ensure consistency, or check for changes
        if (tx.price !== data.amount || new Date(tx.date).getTime() !== new Date(data.startDate).getTime()) {
            await prisma.transaction.update({
                where: { id: tx.id },
                data: {
                    price: data.amount, // Principal is stored in price (Quantity = 1)
                    quantity: 1,
                    date: data.startDate
                }
            })
        }
    }

    revalidatePath('/deposits')
    revalidatePath('/')
}

export async function addDeposit(data: DepositData) {
    const { amount, bankName, currency, interestRate, startDate, maturityDate } = data

    // Generate a unique ID/Symbol for the deposit
    // e.g. DEP-SANTANDER-timestamp
    const timestamp = new Date().getTime()
    const symbol = `DEP-${bankName.toUpperCase().substring(0, 3)}-${timestamp}`
    const name = `${bankName} ${interestRate}% Deposit`

    try {
        // 1. Create Asset (Deposit)
        await prisma.asset.create({
            data: {
                symbol,
                name,
                type: 'DEPOSIT',
                bankName,
                interestRate,
                maturityDate,
            }
        })

        // 2. Create Initial Transaction (Deposit of funds)
        await prisma.transaction.create({
            data: {
                assetId: symbol,
                type: 'DEPOSIT', // Using custom type, or just 'BUY'
                quantity: 1, // 1 unit of this deposit
                price: amount,
                currency,
                date: startDate,
            }
        })

        revalidatePath('/deposits')
        return { success: true }
    } catch (e) {
        console.error("Failed to add deposit", e)
        return { success: false }
    }
}

export async function getDeposits() {
    const deposits = await prisma.asset.findMany({
        where: { type: 'DEPOSIT' },
        include: {
            transactions: true
        }
    })

    // Calculate current value including accrued interest
    // Simple Interest: P * r * t
    const now = new Date()

    return deposits.map(d => {
        const principal = d.transactions.reduce((sum, t) => sum + t.price, 0)
        const startDate = d.transactions[0]?.date || new Date()
        const maturityDate = d.maturityDate || new Date()

        // Calculate days elapsed since start
        const daysElapsedRaw = Math.max(0, (now.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
        const totalDuration = Math.max(1, (new Date(maturityDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))

        // Cap elapsed days at total duration (Interest stops accruing at maturity)
        const daysElapsed = Math.min(daysElapsedRaw, totalDuration)

        // Progress (0 to 100)
        const progress = Math.min(100, (daysElapsedRaw / totalDuration) * 100)

        // Accrued Interest
        // Rate is typically annual (e.g. 2.5%)
        // Interest = Principal * (Rate/100) * (DaysElapsed / 365)
        const accruedInterest = principal * ((d.interestRate || 0) / 100) * (daysElapsed / 365)

        // Projected Total Interest (at maturity)
        const projectedInterest = principal * ((d.interestRate || 0) / 100) * (totalDuration / 365)

        return {
            id: d.symbol,
            bankName: d.bankName || 'Unknown Bank',
            name: d.name,
            principal,
            currency: d.transactions[0]?.currency || 'EUR',
            rate: d.interestRate || 0,
            startDate,
            maturityDate,
            accruedInterest,
            projectedInterest,
            totalValue: principal + accruedInterest,
            progress
        }
    })
}

const now = new Date()

export async function addPension(data: PensionData) {
    const { name, currentValue, quantity, investedAmount, currency, isTaxAdvantaged } = data
    const symbol = `PPR-${name.toUpperCase().replace(/\s+/g, '-')}-${new Date().getTime()}`

    try {
        // Calculate implied current price per unit
        const currentPricePerUnit = quantity > 0 ? currentValue / quantity : 0
        const costPerUnit = quantity > 0 ? investedAmount / quantity : 0

        // 1. Create Asset with Manual Price
        await prisma.asset.create({
            data: {
                symbol,
                name,
                type: 'PENSION',
                isTaxAdvantaged,
                manualPrice: currentPricePerUnit
            }
        })

        // 2. Transaction (Initial Balance / Buy)
        await prisma.transaction.create({
            data: {
                assetId: symbol,
                type: 'BUY',
                quantity: quantity,
                price: costPerUnit, // Store COST per unit in transaction
                currency,
                date: new Date(),
            }
        })

        revalidatePath('/pension')
        return { success: true }
    } catch (e) {
        console.error("Failed to add pension", e)
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
}

export async function updatePension(id: string, data: { name: string, isTaxAdvantaged: boolean, manualPrice?: number }) {
    try {
        await prisma.asset.update({
            where: { symbol: id },
            data: {
                name: data.name,
                isTaxAdvantaged: data.isTaxAdvantaged,
                ...(data.manualPrice ? { manualPrice: data.manualPrice } : {})
            }
        })
        revalidatePath('/pension')
        return { success: true }
    } catch (e) {
        console.error("Failed to update pension", e)
        return { success: false }
    }
}

export async function addPensionContribution(id: string, amount: number, quantity: number, date: Date) {
    try {
        const asset = await prisma.asset.findUnique({
            where: { symbol: id },
            include: { transactions: true }
        })

        const currency = asset?.transactions[0]?.currency || 'EUR'
        // Cost per unit for this contribution
        const pricePerUnit = quantity > 0 ? amount / quantity : 0

        await prisma.transaction.create({
            data: {
                assetId: id,
                type: 'BUY',
                quantity: quantity,
                price: pricePerUnit,
                currency,
                date: date,
            }
        })

        revalidatePath('/pension')
        revalidatePath('/')
        return { success: true }
    } catch (e) {
        console.error("Failed to add contribution", e)
        return { success: false }
    }
}

export async function getPensions() {
    const pensions = await prisma.asset.findMany({
        where: { type: 'PENSION' },
        include: {
            transactions: true
        }
    })

    return pensions.map(p => {
        // Calculate Holdings
        const totalUnits = p.transactions.reduce((sum, t) => sum + t.quantity, 0)
        const totalInvested = p.transactions.reduce((sum, t) => sum + (t.quantity * t.price), 0)

        // Current Value = Units * Manual Price
        // If manualPrice is missing/zero, fallback to invested (no gain logic available yet)
        const currentPrice = p.manualPrice || (totalUnits > 0 ? totalInvested / totalUnits : 0)
        const currentValue = totalUnits * currentPrice

        const gain = currentValue - totalInvested
        const gainPercent = totalInvested > 0 ? (gain / totalInvested) * 100 : 0

        // Calculate current year contributions for tax tracking
        const currentYear = new Date().getFullYear()
        const currentYearContributions = p.transactions
            .filter(t => new Date(t.date).getFullYear() === currentYear)
            .reduce((sum, t) => sum + (t.quantity * t.price), 0)

        return {
            id: p.symbol,
            name: p.name || 'Unknown Fund',
            totalValue: currentValue,
            invested: totalInvested,
            gain,
            gainPercent,
            currency: p.transactions[0]?.currency || 'EUR',
            isTaxAdvantaged: p.isTaxAdvantaged,
            currentYearContributions,
            units: totalUnits,
            price: currentPrice
        }
    })
}
export async function deleteAsset(id: string) {
    try {
        // Delete Asset (Cascade delete should handle transactions if set up, 
        // but explicit delete is safer for MVP if schema is simple)

        // Delete transactions first to be safe
        await prisma.transaction.deleteMany({
            where: { assetId: id }
        })

        await prisma.asset.delete({
            where: { symbol: id }
        })

        revalidatePath('/')
        revalidatePath('/deposits')
        revalidatePath('/pension')
        revalidatePath('/investments')
        return { success: true }
    } catch (e) {
        console.error("Failed to delete asset", e)
        return { success: false }
    }
}

export async function deleteTransaction(id: string) {
    try {
        // Get transaction to find asset
        const transaction = await prisma.transaction.findUnique({
            where: { id }
        })

        if (!transaction) {
            return { success: false, error: 'Transaction not found' }
        }

        const assetId = transaction.assetId

        // Delete the transaction
        await prisma.transaction.delete({
            where: { id }
        })

        // Check if asset has any remaining transactions
        const remainingTransactions = await prisma.transaction.count({
            where: { assetId }
        })

        // If no transactions remain, delete the asset too
        if (remainingTransactions === 0) {
            await prisma.asset.delete({
                where: { symbol: assetId }
            })
        }

        revalidatePath('/')
        revalidatePath('/investments')
        return { success: true }
    } catch (e) {
        console.error("Failed to delete transaction", e)
        return { success: false }
    }
}

// --- Cloud Backup Actions ---

export async function getGoogleAuthUrl() {
    const credentials = await getCloudCredentials()
    if (!credentials.clientId) {
        throw new Error('Google Client ID is not configured. Please go to Cloud Sync settings.')
    }
    const oauth2Client = getOAuthClient(credentials)
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        prompt: 'consent'
    })
    return url
}

export async function backupToGoogleDrive(tokens: any) {
    try {
        const credentials = await getCloudCredentials()
        const oauth2Client = getOAuthClient(credentials)
        oauth2Client.setCredentials(tokens)
        const drive = google.drive({ version: 'v3', auth: oauth2Client })

        // 1. Read the DB file
        const fileContent = fs.readFileSync(DB_PATH)

        // 2. Check for existing backup file
        const res = await drive.files.list({
            q: "name = 'folio_backup.db' and trashed = false",
            fields: 'files(id, name)',
            spaces: 'drive',
        })

        const existingFile = res.data.files?.[0]

        if (existingFile?.id) {
            // Update
            await drive.files.update({
                fileId: existingFile.id,
                media: {
                    mimeType: 'application/x-sqlite3',
                    body: fs.createReadStream(DB_PATH)
                },
            })
            return { success: true, message: 'Backup updated' }
        } else {
            // Create
            await drive.files.create({
                requestBody: {
                    name: 'folio_backup.db',
                    mimeType: 'application/x-sqlite3',
                },
                media: {
                    mimeType: 'application/x-sqlite3',
                    body: fs.createReadStream(DB_PATH)
                },
            })
            return { success: true, message: 'New backup created' }
        }
    } catch (e) {
        console.error("Backup failed", e)
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
}

export async function restoreFromGoogleDrive(tokens: any) {
    try {
        const credentials = await getCloudCredentials()
        const oauth2Client = getOAuthClient(credentials)
        oauth2Client.setCredentials(tokens)
        const drive = google.drive({ version: 'v3', auth: oauth2Client })

        // 1. Find the backup file
        const res = await drive.files.list({
            q: "name = 'folio_backup.db' and trashed = false",
            fields: 'files(id, name)',
            spaces: 'drive',
        })

        const file = res.data.files?.[0]
        if (!file?.id) {
            return { success: false, error: 'No backup file found in Google Drive.' }
        }

        // 2. Download the file
        const response = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'stream' }
        )

        const dest = fs.createWriteStream(DB_PATH)

        return new Promise<{ success: boolean, error?: string }>((resolve, reject) => {
            response.data
                .on('end', () => {
                    console.log('Restore downloaded successfully.')
                    resolve({ success: true })
                })
                .on('error', (err) => {
                    console.error('Download stream error', err)
                    reject({ success: false, error: err.message })
                })
                .pipe(dest)
        })
    } catch (e) {
        console.error("Restore failed", e)
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
}
// --- Local Backup Actions ---

export async function exportDatabase() {
    try {
        const dbContent = fs.readFileSync(DB_PATH)
        return { success: true, content: dbContent.toString('base64'), filename: 'folio_backup.db' }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function importDatabase(base64Content: string) {
    try {
        const buffer = Buffer.from(base64Content, 'base64')
        fs.writeFileSync(DB_PATH, buffer)
        revalidatePath('/')
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

export async function backupToLocalPath(targetPath: string) {
    try {
        // Ensure directory exists
        const dir = path.dirname(targetPath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        // If targetPath is a directory, append default filename
        let fullPath = targetPath
        if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
            fullPath = path.join(targetPath, 'folio_backup.db')
        }

        fs.copyFileSync(DB_PATH, fullPath)
        return { success: true, path: fullPath }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
}

// --- Historical Price Sync ---

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function syncHistoricalPrices(symbols?: string[]) {
    try {
        const assets = await prisma.asset.findMany({
            where: {
                type: { in: ['STOCK', 'ETF'] },
                ...(symbols ? { symbol: { in: symbols } } : {})
            },
            include: { transactions: { orderBy: { date: 'asc' }, take: 1 } }
        });

        console.log(`[syncHistoricalPrices] Syncing ${assets.length} assets with Yahoo.`);

        for (const asset of assets) {
            if (asset.transactions.length === 0) continue;

            // Optimization: Check if we already have data for the current month
            const lastHistory = await prisma.historicalPrice.findFirst({
                where: { symbol: asset.symbol },
                orderBy: { date: 'desc' },
                select: { date: true }
            });

            // If existing data is fresher than 25 days, skip to save requests
            if (lastHistory && lastHistory.date > new Date(Date.now() - 1000 * 60 * 60 * 24 * 25)) {
                console.log(`[syncHistoricalPrices] Skipping ${asset.symbol}, data is fresh enough.`);
                continue;
            }

            // ADDED THROTTLING: Random delay between 2-5 seconds to avoid 429s
            await delay(2000 + Math.random() * 3000);

            try {
                // YAHOO FALLBACK (Original Logic)
                const startDate = (asset.transactions[0] && asset.transactions[0].date) || new Date('2020-01-01');
                console.log(`[syncHistoricalPrices] Fetching Yahoo history for ${asset.symbol}`);

                const queryOptions = {
                    period1: startDate,
                    period2: new Date(),
                    interval: '1mo' as const,
                };

                const results = await yahooFinance.historical(asset.symbol, queryOptions);

                for (const row of results) {
                    const rowDate = new Date(row.date);
                    const endOfMonth = new Date(rowDate.getFullYear(), rowDate.getMonth() + 1, 0);

                    await prisma.historicalPrice.upsert({
                        where: { symbol_date: { symbol: asset.symbol, date: endOfMonth } },
                        update: { price: row.close || row.adjClose || 0, currency: asset.lastCurrency || 'USD' },
                        create: { symbol: asset.symbol, date: endOfMonth, price: row.close || row.adjClose || 0, currency: asset.lastCurrency || 'USD' }
                    });
                }
            } catch (err: any) {
                console.error(`[syncHistoricalPrices] Failed for ${asset.symbol}:`, err.message);
                if (err.code === 429 || err.status === 429 || err.message?.includes('429')) {
                    console.error('[syncHistoricalPrices] Rate limit hit. Stopping sync.');
                    break;
                }
            }
        }
        return { success: true };
    } catch (e) {
        console.error("[syncHistoricalPrices] Global error:", e);
        return { success: false };
    }
}
