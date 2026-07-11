'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Archive, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteAsset } from '@/app/actions'
import { useConfirm } from '@/components/ui/confirm-dialog'

type ClosedPosition = {
    symbol: string
    name: string
    quantity: number
    totalInvested: number
    proceeds: number
    realizedGain: number
    realizedGainPercent: number
    lastDate: Date | string | null
}

export function ClosedPositionsTable({
    positions,
    currency,
    usdPerEur,
}: {
    positions: ClosedPosition[]
    currency: string
    usdPerEur: number
}) {
    const router = useRouter()
    const confirmDialog = useConfirm()
    const [isOpen, setIsOpen] = useState(false)
    const [deletingSymbol, setDeletingSymbol] = useState<string | null>(null)

    if (positions.length === 0) return null

    const isEur = currency === 'EUR'

    const convert = (usdAmount: number) => (isEur ? usdAmount / usdPerEur : usdAmount)

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val)

    const formatPct = (val: number) =>
        `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`

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
        } catch {
            toast.error('Failed to delete asset')
        } finally {
            setDeletingSymbol(null)
        }
    }

    const totalRealized = positions.reduce((sum, p) => sum + convert(p.realizedGain), 0)

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Header / Toggle */}
            <button
                onClick={() => setIsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-800/50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Archive className="w-5 h-5 text-zinc-400" />
                    <span className="text-base font-semibold text-white">
                        Closed Positions
                    </span>
                    <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">
                        {positions.length}
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <span
                        className={cn(
                            'text-sm font-medium',
                            totalRealized >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}
                    >
                        {totalRealized >= 0 ? '+' : ''}
                        {formatCurrency(totalRealized)} realized
                    </span>
                    {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                    )}
                </div>
            </button>

            {/* Collapsible Table */}
            {isOpen && (
                <div className="border-t border-zinc-800">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-800/60 text-zinc-400">
                            <tr>
                                <th className="px-6 py-3 font-medium">Asset</th>
                                <th className="px-6 py-3 font-medium text-right">Invested</th>
                                <th className="px-6 py-3 font-medium text-right">Proceeds</th>
                                <th className="px-6 py-3 font-medium text-right">Realized P&amp;L</th>
                                <th className="px-6 py-3 font-medium text-right">Sold</th>
                                <th className="px-6 py-3 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                            {positions.map((pos) => {
                                const invested = convert(pos.totalInvested)
                                const proceeds = convert(pos.proceeds)
                                const gain = convert(pos.realizedGain)
                                const isGain = gain >= 0

                                return (
                                    <tr key={pos.symbol} className="hover:bg-zinc-800/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-white">
                                                <a
                                                    href={`/investments/${encodeURIComponent(pos.symbol)}?currency=${currency}`}
                                                    className="hover:text-indigo-400 transition-colors hover:underline"
                                                >
                                                    {pos.name}
                                                </a>
                                                <span className="text-zinc-500 font-normal ml-1">
                                                    ({pos.symbol})
                                                </span>
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-0.5">Fully sold</div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-zinc-300">
                                            {formatCurrency(invested)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-zinc-300">
                                            {formatCurrency(proceeds)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className={cn('font-medium', isGain ? 'text-emerald-500' : 'text-rose-500')}>
                                                {isGain ? '+' : ''}{formatCurrency(gain)}
                                            </div>
                                            <div className={cn('text-xs', isGain ? 'text-emerald-600' : 'text-rose-600')}>
                                                {formatPct(pos.realizedGainPercent)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-zinc-400 text-xs">
                                            {pos.lastDate
                                                ? new Date(pos.lastDate).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                })
                                                : '—'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleDelete(pos.symbol)}
                                                disabled={deletingSymbol === pos.symbol}
                                                className="text-zinc-600 hover:text-rose-500 transition-colors disabled:opacity-50"
                                                title="Permanently delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
