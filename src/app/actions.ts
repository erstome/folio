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

// Basic ISIN Regex (2 letters + 9 alphanumeric + 1 digit)
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// ISIN to Ticker Cache (24 hour TTL)
const ISIN_CACHE: Record<string, { ticker: string, timestamp: number }> = {};
const ISIN_TTL = 24 * 60 * 60 * 1000;

// Manual Overrides for specific ISINs (Key: ISIN, Value: Ticker)
const ISIN_OVERRIDES: Record<string, string> = {
    "KYG9830T1067": "3CP.F" // Xiaomi Corporation (Frankfurt - EUR)
};

async function resolveISIN(isin: string): Promise<string | null> {
    // 0. Check Overrides
    if (ISIN_OVERRIDES[isin]) {
        console.log(`[resolveISIN] Override ${isin} -> ${ISIN_OVERRIDES[isin]}`);
        return ISIN_OVERRIDES[isin];
    }

    // 1. Check Cache
    if (ISIN_CACHE[isin] && (Date.now() - ISIN_CACHE[isin].timestamp < ISIN_TTL)) {
        return ISIN_CACHE[isin].ticker;
    }

    // 2. Search via Yahoo
    try {
        const result = await yahooFinance.search(isin);
        if (result.quotes && result.quotes.length > 0) {
            // Pick first equity/ETF result
            const bestMatch = result.quotes.find((q: any) => q.isYahooFinance);
            if (bestMatch && bestMatch.symbol) {
                console.log(`[resolveISIN] Resolved ${isin} -> ${bestMatch.symbol}`);
                ISIN_CACHE[isin] = { ticker: bestMatch.symbol, timestamp: Date.now() };
                return bestMatch.symbol;
            }
        }
    } catch (e) {
        console.error(`[resolveISIN] Failed to resolve ${isin}`, e);
    }
    return null;
}

export async function getQuotes(symbols: string[]) {
    if (symbols.length === 0) return {}

    const now = Date.now();
    const uniqueSymbols = Array.from(new Set(symbols)); // De-dupe input
    const results: any = {};
    const symbolsToResolve: string[] = [];  // ISINs needing resolution
    const directSymbols: string[] = [];     // Regular Tickers + Resolved Tickers

    // Reverse Map: Ticker -> List of original ISINs (to map result back)
    const tickerToISINs: Record<string, string[]> = {};

    // 1. Check Cache First & Classify Symbols
    for (const sym of uniqueSymbols) {
        const cached = QUOTE_CACHE[sym];
        if (cached && (now - cached.timestamp < CACHE_TTL)) {
            results[sym] = cached.data;
        } else {
            if (ISIN_REGEX.test(sym)) {
                symbolsToResolve.push(sym);
            } else {
                directSymbols.push(sym);
            }
        }
    }

    // 2. Resolve ISINs
    for (const isin of symbolsToResolve) {
        const ticker = await resolveISIN(isin);
        if (ticker) {
            directSymbols.push(ticker);
            if (!tickerToISINs[ticker]) tickerToISINs[ticker] = [];
            tickerToISINs[ticker].push(isin);
        } else {
            // Failed to resolve, might try as direct symbol or fail
            console.warn(`[getQuotes] Could not resolve ISIN: ${isin}`);
            // Add to direct symbols just in case it works directly on some API?
            // Unlikely, but fallback.
            directSymbols.push(isin);
        }
    }

    // Ensure Unique
    const finalSymbolsToFetch = Array.from(new Set(directSymbols));

    if (finalSymbolsToFetch.length === 0) {
        return results;
    }

    console.log(`[getQuotes] Fetching fresh quotes for: ${finalSymbolsToFetch.join(', ')}`)

    // RE-USING DATA FETCHING LOGIC with internal function to process results
    const processResult = async (symbol: string, data: any) => {
        // 1. Update Direct Cache (Ticker)
        QUOTE_CACHE[symbol] = { price: data.price, data: data, timestamp: Date.now() };

        // 2. Add to results (Ticker) if requested
        if (uniqueSymbols.includes(symbol)) {
            results[symbol] = data;
        }

        // 3. Add to results (ISINs) mapped to this Ticker
        if (tickerToISINs[symbol]) {
            for (const isin of tickerToISINs[symbol]) {
                const isinData = { ...data, name: data.name || isin }; // Keep ISIN distinct?
                results[isin] = isinData;
                QUOTE_CACHE[isin] = { price: data.price, data: isinData, timestamp: Date.now() };

                // DB Update for ISIN specifically
                try {
                    await prisma.asset.upsert({
                        where: { symbol: isin },
                        update: { lastPrice: data.price, lastCurrency: data.currency, lastUpdate: new Date() },
                        create: { symbol: isin, name: data.name, type: 'STOCK', lastPrice: data.price, lastCurrency: data.currency, lastUpdate: new Date() }
                    });
                } catch (e) { }
            }
        }

        // 4. DB Update for Ticker
        try {
            await prisma.asset.upsert({
                where: { symbol: symbol },
                update: { lastPrice: data.price, lastCurrency: data.currency, lastUpdate: new Date() },
                create: { symbol: symbol, name: data.name, type: 'STOCK', lastPrice: data.price, lastCurrency: data.currency, lastUpdate: new Date() }
            });
        } catch (e) { }
    };


    // 3. Try Twelvedata if Key exists
    const settings = await getSettings();
    let symbolsToFetch = [...finalSymbolsToFetch];

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

                    await processResult(q.symbol, quoteData);
                    fetchedSymbols.add(q.symbol);
                }
            }
            symbolsToFetch = symbolsToFetch.filter(s => !fetchedSymbols.has(s));
        } catch (e: any) {
            console.error('[getQuotes] Twelvedata failed:', e.message);
        }
    }

    // 4. Try FMP if Key exists
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
                    await processResult(q.symbol, quoteData);
                    fetchedSymbols.add(q.symbol);
                }
            }
            symbolsToFetch = symbolsToFetch.filter(s => !fetchedSymbols.has(s));
        } catch (e: any) {
            console.error('[getQuotes] FMP failed:', e.message);
        }
    }

    // 5. Fallback to Yahoo
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
                    await processResult(q.symbol, quoteData);
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

export async function parseTradeRepublicStatement(fileData: string) {
    try {
        // Dynamic import for parser (needed because it uses require for pdf-parse)
        const parserModule = await import('@/lib/trade-republic-parser')
        const parseTradeRepublicStatement = parserModule.parseTradeRepublicStatement

        // Convert base64 to buffer
        const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData
        const buffer = Buffer.from(base64Data, 'base64')

        // Parse the PDF
        const transactions = await parseTradeRepublicStatement(buffer)

        // Return parsed transactions (only BUY/SELL for now)
        return {
            success: true,
            transactions: transactions.filter(tx =>
                (tx.type === 'BUY' || tx.type === 'SELL') &&
                tx.symbol &&
                tx.quantity &&
                tx.amount > 0
            )
        }
    } catch (e) {
        console.error("Failed to parse Trade Republic statement", e)
        return {
            success: false,
            error: e instanceof Error ? e.message : 'Unknown error',
            transactions: []
        }
    }
}

export async function importTradeRepublicStatement(fileData: string, fileName: string, selectedTransactions?: number[]) {
    try {
        // Use the parse function (which we just created)
        const parseResult = await parseTradeRepublicStatement(fileData)
        if (!parseResult.success) {
            return parseResult
        }

        const parserModule = await import('@/lib/trade-republic-parser')
        const isinToSymbol = parserModule.isinToSymbol

        // Filter transactions if specific indices were selected
        const transactionsToImport = selectedTransactions
            ? selectedTransactions.map(i => parseResult.transactions[i]).filter(Boolean)
            : parseResult.transactions

        // Import statistics
        let imported = 0
        let skipped = 0
        const errors: string[] = []

        // Import each transaction
        for (const tx of transactionsToImport) {
            if (!tx.symbol || !tx.quantity || tx.amount === 0) {
                skipped++
                continue
            }

            try {
                // Use ISIN directly - Yahoo Finance supports ISIN lookups
                const symbol = isinToSymbol(tx.symbol)

                // Calculate price per share from total amount
                const price = tx.amount / tx.quantity

                // Import as transaction (symbol will be the ISIN)
                await addTransaction({
                    symbol,
                    type: tx.type,
                    quantity: tx.quantity,
                    price,
                    date: tx.date,
                    currency: tx.currency || 'EUR',
                    assetName: tx.assetName || undefined
                })

                imported++
            } catch (error) {
                errors.push(`Failed to import ${tx.description}: ${error instanceof Error ? error.message : 'Unknown error'}`)
                skipped++
            }
        }

        revalidatePath('/')
        revalidatePath('/investments')

        return {
            success: true,
            imported,
            skipped,
            errors: errors.slice(0, 10) // Limit errors
        }
    } catch (e) {
        console.error("Failed to import Trade Republic statement", e)
        return {
            success: false,
            error: e instanceof Error ? e.message : 'Unknown error',
            imported: 0,
            skipped: 0,
            errors: []
        }
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

            // If existing data is fresher than 5 days (relaxed from 25 to ensure end-of-month data isn't missed), skip
            if (lastHistory && lastHistory.date > new Date(Date.now() - 1000 * 60 * 60 * 24 * 5)) {
                // console.log(`[syncHistoricalPrices] Skipping ${asset.symbol}, data is fresh enough.`);
                continue;
            }

            // ADDED THROTTLING: Random delay between 2-5 seconds to avoid 429s
            await delay(2000 + Math.random() * 3000);

            try {
                // YAHOO FALLBACK (Original Logic)
                const startDate = (asset.transactions[0] && asset.transactions[0].date) || new Date('2020-01-01');

                // --- ISIN RESOLUTION START ---
                let querySymbol = asset.symbol;

                // 1. Check Overrides
                if (ISIN_OVERRIDES[asset.symbol]) {
                    querySymbol = ISIN_OVERRIDES[asset.symbol];
                }
                // 2. Check Cache
                else if (ISIN_CACHE[asset.symbol] && ISIN_CACHE[asset.symbol].ticker) {
                    querySymbol = ISIN_CACHE[asset.symbol].ticker!;
                }
                // 3. Resolve if looks like ISIN (Simple regex: 2 chars + 9-10 alphanum)
                else if (/^[A-Z]{2}[A-Z0-9]{9,10}$/.test(asset.symbol)) {
                    console.log(`[syncHistoricalPrices] Resolving ISIN for ${asset.symbol}...`);
                    try {
                        const ticker = await resolveISIN(asset.symbol);
                        if (ticker) querySymbol = ticker;
                    } catch (e) {
                        console.warn(`[syncHistoricalPrices] Failed to resolve ISIN ${asset.symbol}:`, e);
                    }
                }
                // --- ISIN RESOLUTION END ---

                console.log(`[syncHistoricalPrices] Fetching Yahoo history for ${asset.symbol} (using ${querySymbol})`);

                const queryOptions = {
                    period1: startDate,
                    period2: new Date(),
                    interval: '1mo' as const,
                };

                const results = await yahooFinance.historical(querySymbol, queryOptions);

                if (!results || results.length === 0) {
                    console.warn(`[syncHistoricalPrices] No history found for ${querySymbol} (${asset.symbol})`);
                    continue;
                }

                for (const row of results) {
                    const rowDate = new Date(row.date);
                    const endOfMonth = new Date(rowDate.getFullYear(), rowDate.getMonth() + 1, 0);

                    await prisma.historicalPrice.upsert({
                        where: { symbol_date: { symbol: asset.symbol, date: endOfMonth } }, // Save with ORIGINAL Asset Symbol
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

// --- Asset Detail & Performance Logic ---

// Helper: Calculate Month-End Date
const getMonthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

export async function getAssetDetails(symbol: string) {
    const asset = await prisma.asset.findUnique({
        where: { symbol },
        include: { transactions: { orderBy: { date: 'asc' } } }
    });

    if (!asset) return null;

    // Fetch Historical Prices (Monthly)
    const history = await prisma.historicalPrice.findMany({
        where: { symbol },
        orderBy: { date: 'asc' }
    });

    // Create a map of Date("YYYY-MM-DD") -> Price for easy lookup
    // Key: End of Month string
    const priceMap = new Map<string, number>();
    history.forEach(h => {
        priceMap.set(h.date.toISOString().split('T')[0], h.price);
    });

    // Determine Start Date (First transaction or First history)
    const startDate = asset.transactions[0]?.date || new Date();
    const now = new Date();

    // Performance Array
    const monthlyPerformance = [];

    let currentHoldings = 0;

    // TWR Accumulator (Start at 1.0)
    let accumulatedTWR = 1.0;

    // Running Total of Net Invested (Cash Basis)
    let runningInvested = 0;

    // Iterate Monthly from Start Date to Now
    let cursorDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    // Pre-calculate last price if missing from history (for current partial month)
    let currentMarketPrice = asset.lastPrice || 0;
    if (currentMarketPrice === 0 && asset.transactions.length > 0) {
        currentMarketPrice = asset.transactions[asset.transactions.length - 1].price;
    }

    // Track the last price we have reliable data for, so we can forward-fill instead of
    // always falling back to the current price (which makes all historical months show today's price).
    let lastKnownEndPrice = 0;
    // Track the endPrice computed in the previous iteration for startPrice fallback.
    let prevIterEndPrice = 0;

    while (cursorDate <= now) {
        const monthStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
        const monthEnd = getMonthEnd(cursorDate);
        const monthEndStr = monthEnd.toISOString().split('T')[0];

        // Is this the current partial month?
        const isCurrentMonth = monthEnd > now;

        // 1. Identify Transactions in this Month (needed for price fallback below)
        const txsInMonth = asset.transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate >= monthStart && tDate <= monthEnd;
        });

        // 2. Get Price at End of Month
        let endPrice = priceMap.get(monthEndStr);

        if (endPrice !== undefined) {
            // Real historical price — update tracker
            lastKnownEndPrice = endPrice;
        } else if (isCurrentMonth) {
            endPrice = currentMarketPrice;
            lastKnownEndPrice = currentMarketPrice;
        } else {
            // Past month without historical data.
            // Prefer the last transaction price in this month (best available proxy),
            // then carry forward the last known historical price,
            // then fall back to current market price as a last resort.
            const lastTxPrice = [...txsInMonth].reverse().find(t => t.price > 0)?.price ?? 0;
            if (lastTxPrice > 0) {
                endPrice = lastTxPrice;
                lastKnownEndPrice = lastTxPrice;
            } else if (lastKnownEndPrice > 0) {
                endPrice = lastKnownEndPrice;
            } else {
                endPrice = currentMarketPrice;
                lastKnownEndPrice = currentMarketPrice;
            }
        }

        // 3. Calculate metrics for this month
        let netInvested = 0; // Cash Flow (F)
        let weightedFlows = 0; // Sum(Fi * Wi)
        let totalDaysInMonth = monthEnd.getDate();

        txsInMonth.forEach(t => {
            const amount = t.quantity * t.price;
            const flow = t.type === 'BUY' ? amount : -amount;

            netInvested += flow;
            currentHoldings += (t.type === 'BUY' ? t.quantity : -t.quantity);

            // Weight: (DaysTotal - DayOfTx + 1) / DaysTotal (or similar standard convention)
            // Using DaysRemaining / TotalDays
            const tDate = new Date(t.date);
            const daysRemaining = Math.max(0, totalDaysInMonth - tDate.getDate());
            const weight = daysRemaining / totalDaysInMonth;

            weightedFlows += flow * weight;
        });

        // 4. Start Value (V0) = Value at END of prev month
        const prevMonthEnd = new Date(monthStart);
        prevMonthEnd.setDate(0);
        let startPrice = priceMap.get(prevMonthEnd.toISOString().split('T')[0]) ?? 0;

        // Handle start price gaps: use previous iteration's endPrice rather than the current
        // endPrice — using the same price for start and end artificially shows zero gain.
        if (startPrice === 0) {
            startPrice = prevIterEndPrice > 0 ? prevIterEndPrice : endPrice;
        }

        // Record this month's endPrice so next iteration can use it as startPrice fallback
        prevIterEndPrice = endPrice;

        const holdingsAtStart = currentHoldings - (txsInMonth.reduce((acc, t) => acc + (t.type === 'BUY' ? t.quantity : -t.quantity), 0));
        const startValue = holdingsAtStart * startPrice; // V_start
        const endValue = currentHoldings * endPrice; // V_end

        // 5. Modified Dietz Return
        // R = (V_end - V_start - NetFlow) / (V_start + WeightedFlows)
        let monthlyReturn = 0;
        const denominator = startValue + weightedFlows;
        if (denominator !== 0) {
            monthlyReturn = (endValue - startValue - netInvested) / denominator;
        }


        // 6. Chain TWR
        accumulatedTWR *= (1 + monthlyReturn);

        // Update Cumulative Invested (Running Total of Net Cash Flow)
        runningInvested += netInvested;

        let sharesBought = 0;
        let totalBuyCost = 0;

        txsInMonth.forEach(t => {
            if (t.type === 'BUY') {
                sharesBought += t.quantity;
                totalBuyCost += t.quantity * t.price;
            }
        });

        // Filter Logic:
        // Show row if:
        // - We have holdings at end of month (endValue > 0)
        // - OR we had activity this month (netInvested !== 0)
        // - OR we have holdings at start of month (startValue > 0) -> implies we sold EVERYTHING this month
        if (endValue > 0.01 || Math.abs(netInvested) > 0.01 || startValue > 0.01) {
            monthlyPerformance.push({
                month: monthEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                monthSortable: monthEnd.getTime(),
                invested: netInvested,
                cumulativeInvested: runningInvested,
                sharesBought,
                avgBuyPrice: sharesBought > 0 ? totalBuyCost / sharesBought : 0,
                endPrice,
                valuation: endValue,
                gain: endValue - (startValue + netInvested),
                cumulativeGain: endValue - runningInvested,
                gainPercent: monthlyReturn * 100,
                twr: (accumulatedTWR - 1) * 100
            });
        }


        // Move to next month
        cursorDate.setMonth(cursorDate.getMonth() + 1);
    }

    // Calculate Lifetime Stats
    // Total Invested = Sum of all BUYS
    // Total Sales = Sum of all SELLS
    // Current Value = holdings * currentPrice
    // Lifetime Gain = (Current Value + Total Sales) - Total Invested

    let lifetimeInvested = 0;
    let lifetimeSales = 0;

    asset.transactions.forEach(t => {
        const amt = t.price * t.quantity;
        if (t.type === 'BUY') lifetimeInvested += amt;
        else if (t.type === 'SELL') lifetimeSales += amt;
    });

    const currentValuation = (asset.lastPrice || 0) * (monthlyPerformance.length > 0 ? currentHoldings : 0); // Approx
    // Actually, currentHoldings is the running total from the loop, which is correct at end of 'now'.

    const totalLifetimeGain = (currentValuation + lifetimeSales) - lifetimeInvested;

    // Sort descending (newest first)
    return {
        asset,
        performance: monthlyPerformance.reverse(),
        transactions: asset.transactions.reverse(), // Newest first
        stats: {
            lifetimeInvested,
            lifetimeSales,
            totalLifetimeGain,
            totalLifetimeGainPercent: lifetimeInvested > 0 ? (totalLifetimeGain / lifetimeInvested) * 100 : 0
        }
    };
}

// --- Global Portfolio Performance Logic ---

export async function getPortfolioPerformance(targetCurrency = 'EUR') {
    // 1. Fetch ALL Assets with Transactions
    const assets = await prisma.asset.findMany({
        include: { transactions: { orderBy: { date: 'asc' } } }
    });

    if (assets.length === 0) return { performance: [] };

    const symbols = assets.map(a => a.symbol);

    // 2. Fetch ALL Historical Prices
    const history = await prisma.historicalPrice.findMany({
        where: { symbol: { in: [...symbols, 'EURUSD=X'] } },
        orderBy: { date: 'asc' }
    });

    // Map: Symbol -> DateStr -> Price
    const priceMap = new Map<string, Map<string, number>>();
    // Helper to set nested map
    const setPrice = (sym: string, date: string, price: number) => {
        if (!priceMap.has(sym)) priceMap.set(sym, new Map());
        priceMap.get(sym)!.set(date, price);
    };
    // Helper to get price
    const getPrice = (sym: string, date: string) => priceMap.get(sym)?.get(date);

    history.forEach(h => {
        setPrice(h.symbol, h.date.toISOString().split('T')[0], h.price);
    });

    // 3. Determine Global Start Date
    let globalStartDate = new Date();
    assets.forEach(a => {
        if (a.transactions.length > 0 && new Date(a.transactions[0].date) < globalStartDate) {
            globalStartDate = new Date(a.transactions[0].date);
        }
    });

    // 4. Monthly Iteration
    const monthlyPerformance = [];
    const now = new Date();
    let cursorDate = new Date(globalStartDate.getFullYear(), globalStartDate.getMonth(), 1);

    // TWR Accumulator
    let accumulatedTWR = 1.0;

    // Running Invested (Global)
    let runningInvested = 0;

    // Helper: Get XR (Exchange Rate to Target)
    // If target is EUR, and asset is USD, we need USD/EUR rate (which is 1 / EURUSD)
    // If target is EUR, and asset is EUR, rate is 1.
    // If target is USD, and asset is EUR, rate is EURUSD.

    const getExchangeRateToTarget = (assetCurrency: string, dateStr: string): number => {
        if (assetCurrency === targetCurrency) return 1;

        // Try to get EURUSD price for that date
        let eurusd = getPrice('EURUSD=X', dateStr);
        if (!eurusd) {
            // Fallback to active price if available (fetched in page, but we don't have it here easily without another query or passing it in)
            // Or fallback to most recent known. 
            // For now, let's look for ANY eurusd price in history? Too slow.
            // Fallback to 1.1 (standard approx) or maybe we fetched it.
            eurusd = 1.1; // Fallback
        }

        if (targetCurrency === 'EUR' && assetCurrency === 'USD') return 1 / eurusd;
        if (targetCurrency === 'USD' && assetCurrency === 'EUR') return eurusd;

        return 1; // Unknown pair
    };


    while (cursorDate <= now) {
        const monthStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
        const monthEnd = getMonthEnd(cursorDate);
        const monthEndStr = monthEnd.toISOString().split('T')[0];

        let totalStartValue = 0;
        let totalEndValue = 0;
        let totalNetInvested = 0;
        let totalWeightedFlows = 0;
        let totalDaysInMonth = monthEnd.getDate();

        // Iterate all assets to sum up their stats for this month
        for (const asset of assets) {
            const assetCurrency = asset.lastCurrency || 'USD';
            const xr = getExchangeRateToTarget(assetCurrency, monthEndStr);

            // A. Identify Transactions (in this month)
            const txsInMonth = asset.transactions.filter(t => {
                const tDate = new Date(t.date);
                return tDate >= monthStart && tDate <= monthEnd;
            });

            // B. Calculate Net Flow & Weighted Flow (in Asset Currency)
            let assetNetInvested = 0;
            let assetWeightedFlow = 0;

            // We need to track holdings to calculate Start/End Value
            // Holdings BEFORE this month
            // We can calculate this by filtering all transactions < monthStart
            const txsBefore = asset.transactions.filter(t => new Date(t.date) < monthStart);
            let holdingsStart = txsBefore.reduce((acc, t) => acc + (t.type === 'BUY' ? t.quantity : -t.quantity), 0);
            let holdingsEnd = holdingsStart;

            txsInMonth.forEach(t => {
                const flow = (t.type === 'BUY' ? 1 : -1) * (t.quantity * t.price);
                assetNetInvested += flow;
                holdingsEnd += (t.type === 'BUY' ? t.quantity : -t.quantity);

                const tDate = new Date(t.date);
                const daysRemaining = Math.max(0, totalDaysInMonth - tDate.getDate());
                const weight = daysRemaining / totalDaysInMonth;
                assetWeightedFlow += flow * weight;
            });

            // C. Prices (Asset Currency)
            let priceEnd = getPrice(asset.symbol, monthEndStr);
            if (!priceEnd) priceEnd = asset.lastPrice || 0; // Fallback

            // Price Start (End of prev month)
            const prevMonthEnd = new Date(monthStart);
            prevMonthEnd.setDate(0);
            const prevMonthEndStr = prevMonthEnd.toISOString().split('T')[0];
            let priceStart = getPrice(asset.symbol, prevMonthEndStr);
            if (!priceStart) priceStart = priceEnd; // Fallback

            // D. Values (Asset Currency)
            const valStart = holdingsStart * priceStart;
            const valEnd = holdingsEnd * priceEnd;

            // E. Convert to Target and Add to Globals
            totalStartValue += valStart * xr;
            totalEndValue += valEnd * xr;
            totalNetInvested += assetNetInvested * xr;
            totalWeightedFlows += assetWeightedFlow * xr;
        }

        // Modified Dietz Global
        let monthlyReturn = 0;
        const denominator = totalStartValue + totalWeightedFlows;
        if (denominator !== 0) {
            monthlyReturn = (totalEndValue - totalStartValue - totalNetInvested) / denominator;
        }

        accumulatedTWR *= (1 + monthlyReturn);

        // Update Global Running Invested
        runningInvested += totalNetInvested;

        // Filter empty months (if total value is 0 and no activity)
        if (totalEndValue > 0.01 || Math.abs(totalNetInvested) > 0.01 || totalStartValue > 0.01) {
            monthlyPerformance.push({
                month: monthEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                monthSortable: monthEnd.getTime(),
                invested: totalNetInvested, // Net Cash Flow
                cumulativeInvested: runningInvested,
                valuation: totalEndValue,
                gain: totalEndValue - (totalStartValue + totalNetInvested),
                cumulativeGain: totalEndValue - runningInvested,
                gainPercent: monthlyReturn * 100,
                twr: (accumulatedTWR - 1) * 100,
                // These columns don't apply to global aggregate the same way (no single "buy price"), so we omit or null them
                sharesBought: 0,
                avgBuyPrice: 0,
                endPrice: 0
            });
        }

        cursorDate.setMonth(cursorDate.getMonth() + 1);
    }

    return {
        performance: monthlyPerformance.reverse()
    };
}
