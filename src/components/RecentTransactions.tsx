'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddTransactionDialog } from './AddTransactionDialog'
import { deleteTransaction } from '@/app/actions'
import { TransactionData } from '@/app/types'
import { Pencil, Trash2, ArrowUpDown, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm-dialog'

// Extended type to include ID which comes from DB
type Transaction = TransactionData & { id: string }
type SortKey = 'date' | 'asset' | 'type' | 'quantity' | 'price'
type SortDirection = 'asc' | 'desc'

export function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
    const router = useRouter()
    const confirmDialog = useConfirm()
    const [editingTx, setEditingTx] = useState<Transaction | null>(null)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: SortDirection } | null>(null)
    const [filterQuery, setFilterQuery] = useState('')
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const handleDelete = async (id: string, symbol: string) => {
        const confirmed = await confirmDialog({
            title: 'Delete transaction?',
            description: `This will permanently delete this ${symbol} transaction.`,
            confirmLabel: 'Delete',
        })
        if (!confirmed) return
        setDeletingId(id)
        try {
            await deleteTransaction(id)
            toast.success('Transaction deleted')
            router.refresh()
        } catch (error) {
            console.error('Failed to delete transaction:', error)
            toast.error('Failed to delete transaction')
        } finally {
            setDeletingId(null)
        }
    }

    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc'
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc'
        }
        setSortConfig({ key, direction })
    }

    const filteredTransactions = transactions.filter(tx =>
        tx.symbol.toLowerCase().includes(filterQuery.toLowerCase())
    )

    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
        if (!sortConfig) return 0

        let aValue: any = ''
        let bValue: any = ''

        switch (sortConfig.key) {
            case 'date':
                aValue = new Date(a.date).getTime()
                bValue = new Date(b.date).getTime()
                break
            case 'asset':
                aValue = a.symbol
                bValue = b.symbol
                break
            case 'type':
                aValue = a.type
                bValue = b.type
                break
            case 'quantity':
                aValue = a.quantity
                bValue = b.quantity
                break
            case 'price':
                aValue = a.price
                bValue = b.price
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
                        placeholder="Filter transactions..."
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
                            <th className="px-6 py-4 font-medium cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('date')}>
                                <div className="flex items-center gap-2">
                                    Date
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('asset')}>
                                <div className="flex items-center gap-2">
                                    Asset
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('type')}>
                                <div className="flex items-center gap-2">
                                    Type
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('quantity')}>
                                <div className="flex items-center justify-end gap-2">
                                    Qty
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none" onClick={() => handleSort('price')}>
                                <div className="flex items-center justify-end gap-2">
                                    Price
                                    <ArrowUpDown className="w-3 h-3" />
                                </div>
                            </th>
                            <th className="px-6 py-4 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {sortedTransactions.length === 0 ? (
                            <tr className="bg-muted/10">
                                <td className="px-6 py-8 text-muted-foreground text-center" colSpan={6}>
                                    No transactions found.
                                </td>
                            </tr>
                        ) : (
                            sortedTransactions.map((tx) => (
                                <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4 text-muted-foreground">
                                        <span suppressHydrationWarning>
                                            {new Date(tx.date).toLocaleDateString('en-GB')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-foreground">
                                        <div>{tx.assetName || tx.symbol}</div>
                                        <div className="text-xs text-muted-foreground font-normal">({tx.symbol})</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${tx.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-foreground">{tx.quantity}</td>
                                    <td className="px-6 py-4 text-right text-foreground/80">
                                        {/* @ts-ignore */}
                                        {tx.price.toFixed(2)} {tx.currency || 'USD'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setEditingTx(tx)}
                                                className="text-zinc-500 hover:text-white transition-colors"
                                                title="Edit transaction"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(tx.id, tx.symbol)}
                                                disabled={deletingId === tx.id}
                                                className="text-zinc-500 hover:text-rose-500 transition-colors disabled:opacity-50"
                                                title="Delete transaction"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {editingTx && (
                <AddTransactionDialog
                    isOpen={true}
                    onClose={() => setEditingTx(null)}
                    transactionId={editingTx.id}
                    initialData={editingTx}
                />
            )}
        </div>
    )
}
