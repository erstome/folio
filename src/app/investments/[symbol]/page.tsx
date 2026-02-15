
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { getAssetDetails, getQuotes } from "@/app/actions";
import { ArrowLeft, TrendingUp, DollarSign, Activity } from "lucide-react";
import { MonthlyPerformanceTable } from "@/components/MonthlyPerformanceTable";

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

export default async function AssetDetailPage({
    params,
    searchParams
}: {
    params: { symbol: string },
    searchParams: { currency?: string }
}) {
    const symbol = decodeURIComponent(params.symbol);
    const targetCurrency = searchParams?.currency || 'EUR';

    const [data, rateResult] = await Promise.all([
        getAssetDetails(symbol),
        getQuotes(['EURUSD=X'])
    ]);

    if (!data || !data.asset) {
        return (
            <div className="min-h-screen pb-20">
                <Navbar />
                <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="text-center py-20 text-muted-foreground">
                        Asset not found: {symbol}
                    </div>
                    <div className="text-center">
                        <Link href="/" className="text-indigo-500 hover:underline">Return to Dashboard</Link>
                    </div>
                </div>
            </div>
        );
    }

    const { asset, performance, transactions, stats } = data;

    const usdPerEur = rateResult['EURUSD=X']?.price ?? 1.1;
    const assetCurrency = asset.lastCurrency || 'USD';
    let conversionRate = 1;
    if (assetCurrency === 'EUR' && targetCurrency === 'USD') conversionRate = usdPerEur;
    if (assetCurrency === 'USD' && targetCurrency === 'EUR') conversionRate = 1 / usdPerEur;

    const convertedPerformance = performance.map((row: any) => ({
        ...row,
        endPrice:           row.endPrice           * conversionRate,
        avgBuyPrice:        row.avgBuyPrice         * conversionRate,
        invested:           row.invested            * conversionRate,
        cumulativeInvested: row.cumulativeInvested   * conversionRate,
        valuation:          row.valuation            * conversionRate,
        gain:               row.gain                * conversionRate,
        cumulativeGain:     row.cumulativeGain       * conversionRate,
        // gainPercent and twr are ratios — no conversion
    }));

    const convertedStats = {
        ...stats,
        lifetimeInvested:  (stats?.lifetimeInvested  || 0) * conversionRate,
        lifetimeSales:     (stats?.lifetimeSales      || 0) * conversionRate,
        totalLifetimeGain: (stats?.totalLifetimeGain  || 0) * conversionRate,
        // totalLifetimeGainPercent is a ratio — no conversion
    };

    // Formatter
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: targetCurrency }).format(val);

    const formatPct = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2 }).format(val / 100);

    return (
        <div className="min-h-screen pb-20 bg-background">
            <Navbar />

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Header / Nav */}
                <div className="flex items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                                {asset.name || asset.symbol}
                                <span className="text-muted-foreground font-normal text-lg">({asset.symbol})</span>
                            </h1>
                            <div className="text-sm text-muted-foreground mt-0.5 flex gap-3">
                                <span>Current Price: <span className="text-foreground font-medium">{formatCurrency((asset.lastPrice || 0) * conversionRate)}</span></span>
                                {asset.lastUpdate && (
                                    <span>Updated: {new Date(asset.lastUpdate).toLocaleDateString()}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Performance Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Activity className="w-4 h-4" />
                            <span className="text-sm font-medium">Cumulative TWR</span>
                        </div>
                        <div className="text-2xl font-bold text-foreground">
                            {performance.length > 0 ? formatPct(performance[0].twr) : '0.00%'}
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-sm font-medium">Total Lifetime Gain</span>
                        </div>
                        <div className={`text-2xl font-bold ${convertedStats.totalLifetimeGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {convertedStats.totalLifetimeGain >= 0 ? '+' : ''}{formatCurrency(convertedStats.totalLifetimeGain)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                            {formatPct(stats?.totalLifetimeGainPercent || 0)} Return
                        </div>
                    </div>
                </div>

                {/* Monthly Performance Table */}
                <MonthlyPerformanceTable data={convertedPerformance} currency={targetCurrency} />

                {/* Transaction History Table */}
                <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                        Transaction History
                    </h3>
                    <div className="rounded-xl border border-border/50 overflow-hidden bg-muted/30">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-muted text-muted-foreground">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Date</th>
                                    <th className="px-6 py-4 font-medium">Type</th>
                                    <th className="px-6 py-4 font-medium text-right">Quantity</th>
                                    <th className="px-6 py-4 font-medium text-right">Price</th>
                                    <th className="px-6 py-4 font-medium text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {transactions && transactions.length > 0 ? (
                                    transactions.map((t: any) => (
                                        <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors">
                                            <td className="px-6 py-4 font-medium text-foreground">
                                                {new Date(t.date).toLocaleDateString()}
                                            </td>
                                            <td className={`px-6 py-4 font-medium ${t.type === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {t.type}
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-foreground">
                                                {t.quantity}
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                                                {formatCurrency(t.price * conversionRate)}
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums font-medium text-foreground">
                                                {formatCurrency(t.quantity * t.price * conversionRate)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                                            No transactions found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
