import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
})

async function main() {
    try {
        const rates = await yahooFinance.quote(['EUR=X', 'EURUSD=X']);
        const simple = rates.map(r => ({ s: r.symbol, p: r.regularMarketPrice }));
        console.log("Rates:", simple);
    } catch (e) {
        console.error(e);
    }
}

main();
