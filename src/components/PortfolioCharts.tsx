'use client'

import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

export type Holding = {
    symbol: string
    name: string
    quantity: number
    avgCost: number
    totalCost: number
    currentPrice?: number
    marketValue?: number
    gain?: number
    gainPercent?: number
}

const COLORS = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6']

export function PortfolioCharts({ holdings, currency = 'USD' }: { holdings: Holding[], currency?: string }) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    if (holdings.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm">
                <p>No data to display</p>
            </div>
        )
    }

    const data = holdings.map(h => ({
        ...h,
        name: h.name || h.symbol,
        value: h.marketValue || h.totalCost // Fallback to cost if no price
    })).sort((a, b) => b.value - a.value)

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
    }

    const formatPct = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2 }).format(val / 100);
    }

    // Calculate Totals
    const totalValue = data.reduce((sum, item) => sum + (item.marketValue || 0), 0)
    const totalCost = data.reduce((sum, item) => sum + (item.totalCost || 0), 0)
    const totalGain = totalValue - totalCost
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0

    // Determine what to display
    const displayData = selectedIndex !== null ? data[selectedIndex] : null

    // Default to Portfolio Totals if nothing selected
    const mainLabel = displayData ? (displayData.name || displayData.symbol) : "Total Portfolio"
    const mainValue = displayData ? (displayData.marketValue || 0) : totalValue
    const gainValue = displayData ? (displayData.gain || 0) : totalGain
    const gainPct = displayData ? (displayData.gainPercent || 0) : totalGainPct

    const isPositive = gainValue >= 0

    return (
        <div className="relative w-full h-full">
            {/* Center Text Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                <div className="text-xs text-zinc-500 font-medium mb-1 px-4 text-center truncate max-w-[180px]">
                    {mainLabel}
                </div>
                <div className="text-2xl font-bold text-white tracking-tight">
                    {formatCurrency(mainValue)}
                </div>
                <div className={`text-sm font-medium mt-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isPositive ? '+' : ''}{formatCurrency(gainValue)} ({formatPct(gainPct)})
                </div>
            </div>

            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={80} // Increased radius for more space
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        onClick={(_, index) => setSelectedIndex(index === selectedIndex ? null : index)}
                        className="cursor-pointer outline-none focus:outline-none"
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                                stroke={selectedIndex === index ? '#fff' : 'rgba(0,0,0,0)'}
                                strokeWidth={2}
                                className="transition-all duration-300 hover:opacity-80"
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value: number, name: string, entry: any) => [formatCurrency(value), entry.payload.name]}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    )
}
