'use client';

import { useState } from 'react';
import { ArrowUpDown, Calendar } from 'lucide-react';
import { cn } from "@/lib/utils";

type PerformanceRow = {
    month: string;
    monthSortable: number;
    invested: number;
    cumulativeInvested: number;
    sharesBought: number;
    avgBuyPrice: number;
    endPrice: number;
    valuation: number;
    gain: number;
    cumulativeGain: number;
    gainPercent: number;
    twr: number;
}

export function MonthlyPerformanceTable({ data, currency }: { data: PerformanceRow[], currency: string }) {
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const sortedData = [...data].sort((a, b) => {
        return sortOrder === 'asc'
            ? a.monthSortable - b.monthSortable
            : b.monthSortable - a.monthSortable;
    });

    const toggleSort = () => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                    Monthly Performance
                </h3>
                <button
                    onClick={toggleSort}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                    <ArrowUpDown className="w-4 h-4" />
                    Sort by Date ({sortOrder === 'desc' ? 'Newest' : 'Oldest'})
                </button>
            </div>

            <div className="rounded-xl border border-border/50 overflow-hidden bg-muted/30">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-muted text-muted-foreground">
                            <tr>
                                <th className="px-6 py-4 font-medium cursor-pointer hover:text-foreground" onClick={toggleSort}>
                                    Month
                                </th>
                                <th className="px-6 py-4 font-medium text-right">Bought</th>
                                <th className="px-6 py-4 font-medium text-right">End Price</th>
                                <th className="px-6 py-4 font-medium text-right border-l border-border/50">Invested (Net)</th>
                                <th className="px-6 py-4 font-medium text-right">Cum. Invested</th>
                                <th className="px-6 py-4 font-medium text-right border-l border-border/50">Valuation</th>
                                <th className="px-6 py-4 font-medium text-right">Gain / Loss</th>
                                <th className="px-6 py-4 font-medium text-right">Cum. Gain</th>
                                <th className="px-6 py-4 font-medium text-right border-l border-border/50">Return (Mo)</th>
                                <th className="px-6 py-4 font-medium text-right">TWR (Cum)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {sortedData.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-8 text-center text-muted-foreground">
                                        No history found. Try syncing historical prices.
                                    </td>
                                </tr>
                            ) : (
                                sortedData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-800/30 transition-colors group">
                                        <td className="px-6 py-4 font-medium text-foreground">
                                            {row.month}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums text-muted-foreground group-hover:text-foreground">
                                            {row.sharesBought > 0 ? (
                                                <div className="flex flex-col items-end">
                                                    <span>{row.sharesBought}</span>
                                                    <span className="text-xs text-muted-foreground">@ {formatCurrency(row.avgBuyPrice)}</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                                            {formatCurrency(row.endPrice)}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums text-muted-foreground group-hover:text-foreground border-l border-border/50">
                                            {formatCurrency(row.invested)}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums text-muted-foreground font-medium">
                                            {formatCurrency(row.cumulativeInvested)}
                                        </td>
                                        <td className="px-6 py-4 text-right tabular-nums font-medium text-foreground border-l border-border/50">
                                            {formatCurrency(row.valuation)}
                                        </td>
                                        <td className={cn("px-6 py-4 text-right tabular-nums font-medium", row.gain >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                            {row.gain >= 0 ? '+' : ''}{formatCurrency(row.gain)}
                                        </td>
                                        <td className={cn("px-6 py-4 text-right tabular-nums font-bold", row.cumulativeGain >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                            {row.cumulativeGain >= 0 ? '+' : ''}{formatCurrency(row.cumulativeGain)}
                                        </td>
                                        <td className={cn("px-6 py-4 text-right tabular-nums border-l border-border/50", row.gainPercent >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                            {row.gainPercent >= 0 ? '+' : ''}{row.gainPercent.toFixed(2)}%
                                        </td>
                                        <td className={cn("px-6 py-4 text-right tabular-nums font-bold", row.twr >= 0 ? 'text-indigo-400' : 'text-rose-400')}>
                                            {row.twr >= 0 ? '+' : ''}{row.twr.toFixed(2)}%
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <p className="text-xs text-muted-foreground text-center pt-2">
                * Returns calculated using **Modified Dietz** method (time-weighted cash flows).
                <br />
                * TWR is cumulative since inception.
            </p>
        </div>
    );
}
