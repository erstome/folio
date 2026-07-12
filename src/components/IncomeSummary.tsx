'use client'

import { useState, useEffect } from 'react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// Validated palette (dark #18181b and light #ffffff surfaces)
const DIVIDEND_COLOR = '#0284c7'
const INTEREST_COLOR = '#d97706'

type IncomeSummaryData = {
    totalIncome: number
    totalDividends: number
    totalInterest: number
    byMonth: { month: string; monthSortable: number; dividends: number; interest: number }[]
    bySymbol: { symbol: string; name: string; total: number }[]
}

export function IncomeSummary({ income, currency }: { income: IncomeSummaryData; currency: string }) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (income.totalIncome <= 0) return null

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val)

    const formatCompact = (val: number) =>
        new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(val)

    const topPayers = income.bySymbol.slice(0, 3)

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
            <div>
                <h3 className="text-xl font-bold text-white">Income</h3>
                <div className="mt-2 text-3xl font-bold text-white tracking-tight">
                    {formatCurrency(income.totalIncome)}
                </div>
                <div className="text-sm text-zinc-400 mt-1 flex gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: DIVIDEND_COLOR }} />
                        Dividends {formatCurrency(income.totalDividends)}
                    </span>
                    {income.totalInterest > 0 && (
                        <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: INTEREST_COLOR }} />
                            Interest {formatCurrency(income.totalInterest)}
                        </span>
                    )}
                </div>
            </div>

            {mounted && income.byMonth.length > 0 && (
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={income.byMonth} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                            dataKey="month"
                            stroke="var(--muted-foreground)"
                            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'var(--border)' }}
                            minTickGap={16}
                        />
                        <YAxis
                            stroke="var(--muted-foreground)"
                            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={formatCompact}
                            width={54}
                        />
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                            contentStyle={{
                                backgroundColor: 'var(--card)',
                                borderColor: 'var(--border)',
                                borderRadius: '12px',
                                color: 'var(--foreground)',
                            }}
                            itemStyle={{ color: 'var(--foreground)' }}
                            labelStyle={{ color: 'var(--muted-foreground)' }}
                            formatter={(value, name) => [formatCurrency(Number(value) || 0), name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }} />
                        <Bar dataKey="dividends" name="Dividends" stackId="income" fill={DIVIDEND_COLOR} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="interest" name="Interest" stackId="income" fill={INTEREST_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            )}

            {topPayers.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium">Top Sources</div>
                    {topPayers.map(p => (
                        <div key={p.symbol} className="flex items-center justify-between text-sm">
                            <span className="text-zinc-300 truncate mr-2" title={p.name}>{p.name}</span>
                            <span className="text-white font-medium whitespace-nowrap">{formatCurrency(p.total)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
