'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTransaction } from '@/app/actions'
import { TrendingUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'

type AssetTransaction = {
    id: string
    date: string | Date
    type: string
    quantity: number
    price: number
}

export function AssetTransactionsTable({
    transactions,
    symbol,
    currency,
    conversionRate,
}: {
    transactions: AssetTransaction[]
    symbol: string
    currency: string
    conversionRate: number
}) {
    const router = useRouter()
    const confirmDialog = useConfirm()
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val)

    const handleDelete = async (tx: AssetTransaction) => {
        const isLast = transactions.length === 1
        const confirmed = await confirmDialog({
            title: 'Delete transaction?',
            description: isLast
                ? `This is the only ${symbol} transaction — deleting it will also remove the asset.`
                : `This will permanently delete this ${symbol} ${tx.type} transaction.`,
            confirmLabel: 'Delete',
        })
        if (!confirmed) return
        setDeletingId(tx.id)
        try {
            const result = await deleteTransaction(tx.id)
            if (!result.success) throw new Error('Server action failed')
            toast.success('Transaction deleted')
            if (isLast) {
                router.push(`/investments?currency=${currency}`)
            } else {
                router.refresh()
            }
        } catch (error) {
            console.error('Failed to delete transaction:', error)
            toast.error('Failed to delete transaction')
        } finally {
            setDeletingId(null)
        }
    }

    return (
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
                            <th className="px-6 py-4 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {transactions && transactions.length > 0 ? (
                            transactions.map((t) => (
                                <tr key={t.id} className="hover:bg-zinc-800/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-foreground">
                                        <span suppressHydrationWarning>
                                            {new Date(t.date).toLocaleDateString()}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 font-medium ${
                                        t.type === 'BUY' ? 'text-emerald-500' :
                                        t.type === 'SELL' ? 'text-rose-500' :
                                        t.type === 'DIVIDEND' ? 'text-sky-500' :
                                        t.type === 'INTEREST' ? 'text-amber-500' :
                                        'text-zinc-400'
                                    }`}>
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
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDelete(t)}
                                            disabled={deletingId === t.id}
                                            className="text-zinc-500 hover:text-rose-500 transition-colors disabled:opacity-50"
                                            title="Delete transaction"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                                    No transactions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
