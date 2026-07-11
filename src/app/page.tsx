import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { PortfolioCharts } from "@/components/PortfolioCharts";
import { Holding } from "@/app/types";
import { getPortfolio, getQuotes, getDeposits, getPensions } from "./actions";
import { cn } from "@/lib/utils";
import { LayoutDashboard, TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, MoreHorizontal, PiggyBank } from "lucide-react";

export default async function Home({ searchParams }: { searchParams: { currency?: string } }) {
    const targetCurrency = searchParams?.currency || 'EUR';
    const isEur = targetCurrency === 'EUR';

    // 1. Fetch Data in Parallel
    const [rawPortfolio, rawDeposits, rawPensions] = await Promise.all([
        getPortfolio(),
        getDeposits(),
        getPensions(),
    ]);

    const uniqueSymbols = Array.from(new Set(rawPortfolio.map(p => p.symbol)));

    // 2. Fetch Quotes (Only needed for Portfolio valuation)
    const [quotes, rateResult] = await Promise.all([
        getQuotes(uniqueSymbols),
        getQuotes(['EURUSD=X'])
    ]);

    const rateData = rateResult['EURUSD=X'];
    const usdPerEur = (rateData && rateData.price) ? rateData.price : 1.1;

    // Helper: Format Currency
    function formatCurrency(val: number) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: targetCurrency }).format(val);
    }

    // Helper: Convert Currency
    const convertToTarget = (amount: number, currency: string) => {
        if (currency === targetCurrency) return amount;
        if (currency === 'EUR' && targetCurrency === 'USD') return amount * usdPerEur;
        if (currency === 'USD' && targetCurrency === 'EUR') return amount / usdPerEur;
        return amount;
    }

    // 3. Calculate Totals
    // Portfolio - Calculate value AND cost in target currency (same logic as investments page)
    let totalPortfolioValue = 0;
    let totalPortfolioCost = 0;
    rawPortfolio.forEach(asset => {
        const quote = quotes[asset.symbol] || { price: 0, currency: 'USD' };
        let priceInTarget = quote.price;
        if (quote.currency === 'USD' && isEur) priceInTarget /= usdPerEur;
        else if (quote.currency === 'EUR' && !isEur) priceInTarget *= usdPerEur;

        // Convert avgCost to target currency (costs are stored in USD)
        let avgCostInTarget = asset.avgCost;
        if (isEur) {
            avgCostInTarget = asset.avgCost / usdPerEur;
        }

        totalPortfolioValue += asset.quantity * priceInTarget;
        totalPortfolioCost += asset.quantity * avgCostInTarget;
    });

    // Deposits
    // Calculate stats - Active Only for "Current Value"
    const activeDeposits = rawDeposits.filter(d => d.progress < 100)
    const totalDepositsValue = activeDeposits.reduce((sum, d) => sum + d.principal, 0)

    // For interest, we might want total lifetime or just active? 
    // Usually 'Accrued Interest' on a dashboard implies current running. 
    // But 'Total Interest Earned' implies lifetime.
    // Let's stick to Active Accrued for consistency with "Current Assets" view.
    const totalAccruedInterest = activeDeposits.reduce((sum, d) => sum + d.accruedInterest, 0);

    // Pensions
    const totalPensionsValue = rawPensions.reduce((sum, p) => sum + convertToTarget(p.totalValue, p.currency), 0);

    const totalNetWorth = totalPortfolioValue + totalDepositsValue + totalPensionsValue;

    // Calculate Gains BEFORE creating globalAllocation
    // Investments Gain (using properly converted costs)
    const totalInvestmentsGain = totalPortfolioValue - totalPortfolioCost
    const totalInvestmentsGainPercent = totalPortfolioCost > 0 ? (totalInvestmentsGain / totalPortfolioCost) * 100 : 0

    // Deposits Gain (Net Interest of Active Deposits)
    // 28% Tax Rate assumption for consistency
    const activeDepositsNetInterest = activeDeposits.reduce((sum, d) => sum + (d.accruedInterest * 0.72), 0)

    // Pensions Gain
    // For manual pensions, we now rely on the new gain logic from getPensions
    const totalPensionsInvested = rawPensions.reduce((sum, p) => sum + convertToTarget(p.invested || p.totalValue, p.currency), 0)
    const totalPensionsGain = rawPensions.reduce((sum, p) => sum + convertToTarget(p.gain || 0, p.currency), 0)
    const totalPensionsGainPercent = totalPensionsInvested > 0 ? (totalPensionsGain / totalPensionsInvested) * 100 : 0

    // 4. Prepare Global Allocation Data with actual gains
    // We create synthetic "Holdings" to piggyback on the PortfolioCharts component
    const globalAllocation: Holding[] = [
        {
            symbol: 'INVEST',
            name: 'Stock Investments',
            quantity: 1,
            marketValue: totalPortfolioValue,
            currentPrice: totalPortfolioValue,
            avgCost: totalPortfolioCost,
            totalCost: totalPortfolioCost,
            gain: totalInvestmentsGain,
            gainPercent: totalInvestmentsGainPercent,
        },
        {
            symbol: 'DEPOSIT',
            name: 'Bank Deposits',
            quantity: 1,
            marketValue: totalDepositsValue,
            currentPrice: totalDepositsValue,
            avgCost: totalDepositsValue - activeDepositsNetInterest,
            totalCost: totalDepositsValue - activeDepositsNetInterest,
            gain: activeDepositsNetInterest,
            gainPercent: totalDepositsValue > 0 ? (activeDepositsNetInterest / totalDepositsValue) * 100 : 0,
        },
        {
            symbol: 'PENSION',
            name: 'Retirement Funds',
            quantity: 1,
            marketValue: totalPensionsValue,
            currentPrice: totalPensionsValue,
            avgCost: totalPensionsInvested,
            totalCost: totalPensionsInvested,
            gain: totalPensionsGain,
            gainPercent: totalPensionsGainPercent,
        }
    ].filter(h => h.marketValue > 0);

    return (
        <div className="min-h-screen pb-20">
            <Navbar />

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
                            <LayoutDashboard className="w-8 h-8 text-indigo-500" />
                            Global Dashboard
                        </h2>
                        <p className="text-muted-foreground mt-1">Your entire net worth at a glance.</p>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Investments */}
                    <Link href={`/investments?currency=${targetCurrency}`} className="block">
                        <div className="bg-card/50 border border-border rounded-xl p-6 relative overflow-hidden group hover:border-border/80 transition-colors cursor-pointer">
                            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                                <TrendingUp className="w-16 h-16 text-indigo-500" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                                        <TrendingUp className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-muted-foreground font-medium">Investments</h3>
                                </div>
                                <div className="text-3xl font-bold text-foreground tracking-tight">
                                    {formatCurrency(totalPortfolioValue)}
                                </div>
                                <div className={`text-sm mt-1 font-medium ${totalInvestmentsGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {totalInvestmentsGain >= 0 ? '+' : ''}{formatCurrency(totalInvestmentsGain)} ({totalInvestmentsGainPercent.toFixed(2)}%)
                                </div>
                            </div>
                        </div>
                    </Link>

                    {/* Deposits */}
                    <Link href={`/deposits?currency=${targetCurrency}`} className="block">
                        <div className="bg-card/50 border border-border rounded-xl p-6 relative overflow-hidden group hover:border-border/80 transition-colors cursor-pointer">
                            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Wallet className="w-16 h-16 text-emerald-500" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                        <Wallet className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-muted-foreground font-medium">Bank Deposits</h3>
                                </div>
                                <div className="text-3xl font-bold text-foreground tracking-tight">
                                    {formatCurrency(totalDepositsValue)}
                                </div>
                                <div className="text-sm mt-1 font-medium text-emerald-500">
                                    +{formatCurrency(activeDepositsNetInterest)} Net Interest
                                </div>
                            </div>
                        </div>
                    </Link>

                    {/* Pensions */}
                    <Link href={`/pension?currency=${targetCurrency}`} className="block">
                        <div className="bg-card/50 border border-border rounded-xl p-6 relative overflow-hidden group hover:border-border/80 transition-colors cursor-pointer">
                            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                                <PiggyBank className="w-16 h-16 text-amber-500" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                                        <PiggyBank className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-muted-foreground font-medium">Retirement</h3>
                                </div>
                                <div className="text-3xl font-bold text-foreground tracking-tight">
                                    {formatCurrency(totalPensionsValue)}
                                </div>
                                <div className={`text-sm mt-1 font-medium ${totalPensionsGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {totalPensionsGain >= 0 ? '+' : ''}{formatCurrency(totalPensionsGain)} ({totalPensionsGainPercent.toFixed(2)}%)
                                </div>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Global Chart */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-card border border-border rounded-xl p-6 h-[400px]">
                        <h3 className="text-xl font-bold text-foreground mb-6">Global Asset Allocation</h3>
                        {totalNetWorth > 0 ? (
                            <PortfolioCharts holdings={globalAllocation} currency={targetCurrency} />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                                No assets found.
                            </div>
                        )}
                    </div>

                    <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-center">
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold text-foreground">Quick Actions</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <Link href={`/investments?currency=${targetCurrency}`} className="p-4 bg-background border border-border rounded-lg flex items-center justify-between hover:bg-muted transition-colors">
                                    <span className="font-medium text-foreground">Manage Stocks & ETFs</span>
                                    <span className="text-indigo-500 text-sm">Go to Portfolio &rarr;</span>
                                </Link>
                                <Link href={`/deposits?currency=${targetCurrency}`} className="p-4 bg-background border border-border rounded-lg flex items-center justify-between hover:bg-muted transition-colors">
                                    <span className="font-medium text-foreground">Update Bank Deposits</span>
                                    <span className="text-emerald-500 text-sm">Go to Deposits &rarr;</span>
                                </Link>
                                <Link href={`/pension?currency=${targetCurrency}`} className="p-4 bg-background border border-border rounded-lg flex items-center justify-between hover:bg-muted transition-colors">
                                    <span className="font-medium text-foreground">Track Pension Funds</span>
                                    <span className="text-amber-500 text-sm">Go to Retirement &rarr;</span>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
