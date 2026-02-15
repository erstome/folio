const YahooFinance = require('yahoo-finance2').default; // Class
const yahooFinance = new YahooFinance(); // Instance
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    console.log('--- DB Check ---');
    try {
        const assets = await prisma.asset.findMany({
            where: {
                OR: [
                    { name: { contains: 'Xiaomi' } },
                    { symbol: { contains: 'Xiaomi' } },
                    { symbol: { contains: '3CP' } },
                    { symbol: { contains: 'KYG9830T1067' } }
                ]
            }
        });
        console.log('Found Assets:', assets);
    } catch (e) { console.error('DB Error:', e); }

    console.log('\n--- Yahoo Quote Check ---');
    const symbols = ['3CP.DE', '3CP.F', '1810.HK', 'KYG9830T1067'];

    for (const sym of symbols) {
        try {
            const q = await yahooFinance.quote(sym);
            console.log(`${sym}: ${q.regularMarketPrice} ${q.currency} (${q.longName})`);
        } catch (e) {
            console.log(`${sym}: Failed (${e.message})`);
        }
    }

    console.log('\n--- Yahoo Search Check for ISIN ---');
    try {
        const s = await yahooFinance.search('KYG9830T1067');
        console.log('Search Results for KYG9830T1067:', s.quotes.map(q => `${q.symbol} (${q.exchange})`));
    } catch (e) { }
}

check();
