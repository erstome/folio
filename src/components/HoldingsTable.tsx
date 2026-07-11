'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Holding } from '@/app/types'
import { cn } from '@/lib/utils'
import { ArrowUpDown, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteAsset } from '@/app/actions'
import { useConfirm } from '@/components/ui/confirm-dialog'

type SortKey = 'asset' | 'price' | 'balance' | 'value'
type SortDirection = 'asc' | 'desc'

export function HoldingsTable({ holdings, currency }: { holdings: Holding[], currency: string }) {
    const router = useRouter()
    const confirmDialog = useConfirm()
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: SortDirection } | null>(null)
    const [filterQuery, setFilterQuery] = useState('')
    const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null)

    const handleDelete = async (symbol: string) => {
        const confirmed = await confirmDialog({
            title: `Delete ${symbol}?`,
            description: 'This will permanently delete the asset and all its transactions.',
            confirmLabel: 'Delete',
        })
        if (!confirmed) return
        setDeletingSymbol(symbol)
        try {
            await deleteAsset(symbol)
            toast.success(`${symbol} deleted`)
            router.refresh()
        } catch (error) {
            console.error('Failed to delete asset:', error)
            toast.error('Failed to delete asset')
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
                bValue = b.quantity
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Filter assets..."
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        className="bg-card border border-border rounded-lg pl-9 pr-4 py-1.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-full max-w-xs"
                    />
                </div>
            </div>

            <div className="rounded-xl border border-border/50 overflow-hidden bg-muted/30">
                <table className="w-full text-left text-sm">
                    <thead className="bg-muted text-muted-foreground">
                        <tr>
                            <th className="px-6 py-4 font-medium cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('asset')}>
                                <div className="flex items-center gap-2">
                                    Asset
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('price')}>
                                <div className="flex items-center justify-end gap-2">
                                    Price
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('balance')}>
                                <div className="flex items-center justify-end gap-2">
                                    Balance
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('value')}>
                                <div className="flex items-center justify-end gap-2">
                                    Value
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
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
                                        <div className="font-medium text-foreground">
                                            <a href={`/investments/${encodeURIComponent(asset.symbol)}?currency=${currency}`} className="hover:text-indigo-400 transition-colors hover:underline">
                                                {asset.name || asset.symbol}
                                            </a>
                                            <span className="text-muted-foreground font-normal ml-1">({asset.symbol})</span>
                                        </div>
                                        <div className={cn("text-xs mt-1", (asset.gain || 0) >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                            {(asset.gain || 0) >= 0 ? '+' : ''}{formatCurrency(asset.gain || 0)} ({formatPct(asset.gainPercent || 0)})
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-foreground/80 font-medium">
                                            {formatCurrency(asset.currentPrice || 0)}
                                        </div>
                                        {asset.lastUpdate && (
                                            <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-col items-end">
                                                <span suppressHydrationWarning>
                                                    {new Date(asset.lastUpdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {asset.isCached && (
                                                    <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1 rounded border border-amber-500/20 mt-0.5">
                                                        Cached
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-foreground">{asset.quantity}</div>
                                        <div className="text-xs text-muted-foreground">Avg {formatCurrency(asset.avgCost)}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-foreground">
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
