'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Holding } from './PortfolioCharts'
import { cn } from '@/lib/utils'
import { ArrowUpDown, Search, Trash2 } from 'lucide-react'
import { deleteAsset } from '@/app/actions'

type SortKey = 'asset' | 'price' | 'balance' | 'value'
type SortDirection = 'asc' | 'desc'

export function HoldingsTable({ holdings, currency }: { holdings: Holding[], currency: string }) {
    const router = useRouter()
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: SortDirection } | null>(null)
    const [filterQuery, setFilterQuery] = useState('')
    const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null)

    const handleDelete = async (symbol: string) => {
        if (!confirm(`Are you sure you want to delete ${symbol} and all its transactions?`)) {
            return
        }
        setDeletingSymbol(symbol)
        try {
            await deleteAsset(symbol)
            router.refresh()
        } catch (error) {
            console.error('Failed to delete asset:', error)
            alert('Failed to delete asset')
        } finally {
            setDeletingSymbol(null)
        }
    }

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
    }

    const formatPct = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2 }).format(val / 100);
    }

    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc'
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const filteredHoldings = holdings.filter(h =>
        (h.name || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
        h.symbol.toLowerCase().includes(filterQuery.toLowerCase())
    )

    const sortedHoldings = [...filteredHoldings].sort((a, b) => {
        if (!sortConfig) return 0

        let aValue: any = ''
        let bValue: any = ''

        switch (sortConfig.key) {
            case 'asset':
                aValue = a.name || a.symbol
                bValue = b.name || b.symbol
                break
            case 'price':
                aValue = a.currentPrice || 0
                bValue = b.currentPrice || 0
                break
            case 'balance':
                aValue = a.quantity
                bValue = a.quantity
                break
            case 'value':
                aValue = a.marketValue || 0
                bValue = b.marketValue || 0
                break
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Filter assets..."
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full max-w-xs"
                    />
                </div>
            </div>

            <div className="rounded-xl border border-zinc-800/50 overflow-hidden bg-zinc-900/30">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/50 text-zinc-400">
                        <tr>
                            <th className="px-6 py-4 font-medium cursor-pointer hover:text-white transition-colors select-none" onClick={() => handleSort('asset')}>
                                <div className="flex items-center gap-2">
                                    Asset
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-white transition-colors select-none" onClick={() => handleSort('price')}>
                                <div className="flex items-center justify-end gap-2">
                                    Price
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-white transition-colors select-none" onClick={() => handleSort('balance')}>
                                <div className="flex items-center justify-end gap-2">
                                    Balance
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-white transition-colors select-none" onClick={() => handleSort('value')}>
                                <div className="flex items-center justify-end gap-2">
                                    Value
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {sortedHoldings.length === 0 ? (
                            <tr className="bg-zinc-900/20">
                                <td className="px-6 py-8 text-zinc-500 text-center" colSpan={5}>
                                    No assets found.
                                </td>
                            </tr>
                        ) : (
                            sortedHoldings.map((asset) => (
                                <tr key={asset.symbol} className="hover:bg-zinc-800/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-white">{asset.name || asset.symbol} <span className="text-zinc-500 font-normal">({asset.symbol})</span></div>
                                        <div className={cn("text-xs mt-1", (asset.gain || 0) >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                            {(asset.gain || 0) >= 0 ? '+' : ''}{formatCurrency(asset.gain || 0)} ({formatPct(asset.gainPercent || 0)})
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-zinc-300">
                                        {formatCurrency(asset.currentPrice || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-white">{asset.quantity}</div>
                                        <div className="text-xs text-zinc-500">Avg {formatCurrency(asset.avgCost)}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-white">
                                        {formatCurrency(asset.marketValue || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDelete(asset.symbol)}
                                            disabled={deletingSymbol === asset.symbol}
                                            className="text-zinc-500 hover:text-rose-500 transition-colors disabled:opacity-50"
                                            title="Delete asset"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
