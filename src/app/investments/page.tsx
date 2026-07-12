import { Navbar } from "@/components/Navbar";
import { PortfolioCharts } from "@/components/PortfolioCharts";
import { HoldingsTable } from "@/components/HoldingsTable";
import { RecentTransactions } from "@/components/RecentTransactions";
import { ImportButton } from "@/components/ImportButton";
import { ImportXTBButton } from "@/components/ImportXTBButton";
import { getPortfolio, getQuotes, getTransactions, updateAssetName, syncHistoricalPrices, getPortfolioPerformance, getSoldPortfolio, getIncomeSummary, syncFxRatesAction } from "../actions";
import { isCloudMode } from "@/lib/app-mode";
import { cn } from "@/lib/utils";
import { LineChart, Calendar } from 'lucide-react';
import { Holding } from "@/app/types";
import { MonthlyPerformanceTable } from "@/components/MonthlyPerformanceTable";
import { ClosedPositionsTable } from "@/components/ClosedPositionsTable";
import { PortfolioValueChart } from "@/components/PortfolioValueChart";
import { IncomeSummary } from "@/components/IncomeSummary";

export default async function InvestmentsPage({ searchParams }: { searchParams: { currency?: string } }) {
    const targetCurrency = searchParams?.currency || 'EUR';
    const isEur = targetCurrency === 'EUR';

    // 1. Fetch Data
    const [rawPortfolio, transactions, globalPerformance, soldPortfolio, incomeSummary] = await Promise.all([
        getPortfolio(),
        getTransactions(),
        getPortfolioPerformance(targetCurrency),
        getSoldPortfolio(),
        getIncomeSummary(targetCurrency),
    ]);

    const syncSymbols = Array.from(new Set(rawPortfolio.map(p => p.symbol)));

    // 2. Trigger Historical + FX Syncs
    // Local mode: fire-and-forget to keep the page load fast (throttled
    // against Yahoo 429s). Cloud mode: serverless freezes after the response,
    // so they must be awaited — syncHistoricalPrices caps itself at 2 stale
    // symbols per call to stay fast.
    if (isCloudMode()) {
        await syncHistoricalPrices(syncSymbols).catch(err => console.error("Background sync failed:", err));
        await syncFxRatesAction().catch(err => console.error("FX sync failed:", err));
    } else {
        syncHistoricalPrices(syncSymbols).catch(err => console.error("Background sync failed:", err));
        syncFxRatesAction().catch(err => console.error("FX sync failed:", err));
    }

    // 2. Fetch Quotes & Rates
    const [quotes, rateResult] = await Promise.all([
        getQuotes(syncSymbols),
        getQuotes(['EURUSD=X'])
    ]);

    const rateData = rateResult['EURUSD=X'];
    const usdPerEur = (rateData && rateData.price) ? rateData.price : 1.1;

    // Helper: Format Currency
    function formatCurrency(val: number) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: targetCurrency }).format(val);
    }

    // 3. Process Portfolio (Stocks/Crypto)
    const renameOps: Promise<unknown>[] = [];
    const enrichedPortfolio: Holding[] = rawPortfolio.map((asset) => {
        const quote = quotes[asset.symbol] || { price: 0, currency: 'USD', change: 0, changePercent: 0, name: asset.symbol };

        if (quote.name && quote.name !== asset.symbol && asset.name === asset.symbol) {
            renameOps.push(updateAssetName(asset.symbol, quote.name).catch(console.error))
        }
        const displayName = (quote.name && quote.name !== asset.symbol) ? quote.name : (asset.name || asset.symbol);

        let priceInTarget = quote.price;
        if (quote.currency === 'USD' && isEur) {
            priceInTarget = quote.price / usdPerEur;
        } else if (quote.currency === 'EUR' && !isEur) {
            priceInTarget = quote.price * usdPerEur;
        }

        let avgCostInTarget = asset.avgCost;
        if (isEur) {
            avgCostInTarget = asset.avgCost / usdPerEur;
        }

        const currentValue = asset.quantity * priceInTarget;
        const totalCostVector = asset.quantity * avgCostInTarget;
        const gain = currentValue - totalCostVector;
        const gainPercent = totalCostVector > 0 ? (gain / totalCostVector) * 100 : 0;

        return {
            symbol: asset.symbol,
            name: displayName,
            quantity: asset.quantity,
            currentPrice: priceInTarget,
            avgCost: avgCostInTarget,
            totalCost: totalCostVector,
            marketValue: currentValue,
            gain,
            gainPercent,
            lastUpdate: quote.lastUpdate,
            isCached: quote.isCached
        }
    });

    // Cloud mode: unawaited writes would be cut off when the serverless
    // runtime freezes after the response.
    if (isCloudMode() && renameOps.length > 0) await Promise.all(renameOps);

    const totalPortfolioValue = enrichedPortfolio.reduce((acc, curr) => acc + (curr.marketValue || 0), 0);
    const totalGain = enrichedPortfolio.reduce((acc, curr) => acc + (curr.gain || 0), 0);
    const totalCost = enrichedPortfolio.reduce((acc, curr) => acc + (curr.quantity * curr.avgCost), 0);
    const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return (
        <div className="min-h-screen pb-20">
            <Navbar />

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                            <LineChart className="w-8 h-8 text-indigo-500" />
                            Stock Investments
                        </h2>
                        <p className="text-zinc-400 mt-1">Manage your stocks, ETFs and crypto assets.</p>
                    </div>
                    <div className="flex gap-2">
                        <ImportButton />
                        <ImportXTBButton />
                    </div>
                </div>

                {/* Portfolio Value Over Time */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-6">Portfolio Value Over Time</h2>
                    <PortfolioValueChart data={globalPerformance.performance} currency={targetCurrency} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left Column: Tables */}
                    <div className="md:col-span-2 space-y-8">
                        {/* Holdings */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-white">Portfolio Holdings</h2>
                                <div className="text-right">
                                    <div className="text-sm text-zinc-400">Total Value</div>
                                    <div className="text-2xl font-bold text-white">{formatCurrency(totalPortfolioValue)}</div>
                                    <div className={cn("text-xs font-medium", totalGain >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                        {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)} ({totalGainPercent.toFixed(2)}%)
                                    </div>
                                </div>
                            </div>
                            <HoldingsTable
                                holdings={enrichedPortfolio}
                                currency={targetCurrency}
                            />
                        </div>

                        {/* Closed Positions */}
                        {soldPortfolio.length > 0 && (
                            <ClosedPositionsTable
                                positions={soldPortfolio}
                                currency={targetCurrency}
                                usdPerEur={usdPerEur}
                            />
                        )}

                        {/* Recent Activity */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                            <h2 className="text-xl font-bold text-white mb-6">Recent Activity</h2>
                            <RecentTransactions
                                transactions={transactions}
                            />
                        </div>

                        {/* Global Monthly Performance */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-500" />
                                Global Monthly Performance
                            </h2>
                            <MonthlyPerformanceTable data={globalPerformance.performance} currency={targetCurrency} />
                        </div>
                    </div>

                    {/* Right Column: Charts */}
                    <div className="md:col-span-1">
                        <div className="sticky top-24 space-y-8">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 h-[400px]">
                                <h3 className="text-xl font-bold text-white mb-6">Asset Allocation</h3>
                                <PortfolioCharts holdings={enrichedPortfolio} currency={targetCurrency} />
                            </div>

                            <IncomeSummary income={incomeSummary} currency={targetCurrency} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
