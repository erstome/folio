'use client'

import { useState, useEffect } from 'react'
import {
    ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// Validated palette (dark #18181b and light #ffffff surfaces):
// portfolio value = indigo, invested capital = emerald-600
const VALUE_COLOR = '#6366f1'
const INVESTED_COLOR = '#059669'

type PerformancePoint = {
    month: string
    monthSortable: number
    valuation: number
    cumulativeInvested: number
}

export function PortfolioValueChart({
    data,
    currency,
    height = 320,
}: {
    data: PerformancePoint[]
    currency: string
    height?: number
}) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return <div style={{ height }} />

    if (data.length === 0) {
        return (
            <div style={{ height }} className="flex items-center justify-center text-muted-foreground text-sm">
                No performance history yet.
            </div>
        )
    }

    // Source arrays are newest-first; the chart needs ascending time
    const series = [...data].sort((a, b) => a.monthSortable - b.monthSortable)

    const formatCompact = (val: number) =>
        new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(val)

    const formatFull = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val)

    return (
        <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                    <linearGradient id="portfolioValueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VALUE_COLOR} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={VALUE_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                    dataKey="month"
                    stroke="var(--muted-foreground)"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border)' }}
                    minTickGap={24}
                />
                <YAxis
                    stroke="var(--muted-foreground)"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatCompact}
                    width={70}
                />
                <Tooltip
                    cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
                    contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: '12px',
                        color: 'var(--foreground)',
                    }}
                    itemStyle={{ color: 'var(--foreground)' }}
                    labelStyle={{ color: 'var(--muted-foreground)' }}
                    formatter={(value, name) => [formatFull(Number(value) || 0), name]}
                />
                <Legend
                    iconType="plainline"
                    wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
                />
                <Area
                    type="monotone"
                    dataKey="valuation"
                    name="Portfolio Value"
                    stroke={VALUE_COLOR}
                    strokeWidth={2}
                    fill="url(#portfolioValueFill)"
                    dot={false}
                    activeDot={{ r: 4 }}
                />
                <Line
                    type="monotone"
                    dataKey="cumulativeInvested"
                    name="Invested Capital"
                    stroke={INVESTED_COLOR}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                />
            </ComposedChart>
        </ResponsiveContainer>
    )
}
