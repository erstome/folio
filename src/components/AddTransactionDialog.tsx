'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { addTransaction, updateTransaction } from '@/app/actions'
import { TransactionData } from '@/app/types'

type Props = {
    isOpen: boolean
    onClose: () => void
    transactionId?: string
    initialData?: TransactionData
}

export function AddTransactionDialog({ isOpen, onClose, transactionId, initialData }: Props) {
    const [loading, setLoading] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [txType, setTxType] = useState<TransactionData['type']>(initialData?.type || 'BUY')

    // Income rows have no share quantity; they are stored as 1 unit at price=amount
    const isIncome = txType === 'DIVIDEND' || txType === 'INTEREST'

    useEffect(() => {
        setMounted(true)
    }, [])

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        const formData = new FormData(e.currentTarget)

        try {
            const type = formData.get('type') as TransactionData['type']
            const data = {
                symbol: formData.get('symbol') as string,
                type,
                quantity: (type === 'DIVIDEND' || type === 'INTEREST') ? 1 : parseFloat(formData.get('quantity') as string),
                price: parseFloat(formData.get('price') as string),
                currency: formData.get('currency') as string,
                date: new Date(formData.get('date') as string),
            }

            if (transactionId) {
                await updateTransaction(transactionId, data)
            } else {
                await addTransaction(data)
            }
            onClose()
            // Reset form? The dialog unmounts or we can reset manually if it stays.
            // For now, closing is enough. 
        } catch (err) {
            console.error(err)
            toast.error('Failed to save transaction')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen || !mounted) return null

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative">
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">
                        {transactionId ? 'Edit Transaction' : 'Add Transaction'}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Stock Symbol</label>
                        <input
                            name="symbol"
                            required
                            defaultValue={initialData?.symbol}
                            placeholder="AAPL"
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Type</label>
                            <select
                                name="type"
                                value={txType}
                                onChange={(e) => setTxType(e.target.value as TransactionData['type'])}
                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            >
                                <option value="BUY">Buy</option>
                                <option value="SELL">Sell</option>
                                <option value="DIVIDEND">Dividend</option>
                                <option value="INTEREST">Interest</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">Date</label>
                            <input
                                type="date"
                                name="date"
                                required
                                defaultValue={initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            />
                        </div>
                    </div>

                    <div className={`grid gap-4 ${isIncome ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {!isIncome && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Quantity</label>
                                <input
                                    type="number"
                                    step="any"
                                    name="quantity"
                                    required
                                    defaultValue={initialData?.quantity}
                                    placeholder="0"
                                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">{isIncome ? 'Amount' : 'Price'}</label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="any"
                                    name="price"
                                    required
                                    defaultValue={initialData?.price}
                                    placeholder="0.00"
                                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                                <select
                                    name="currency"
                                    defaultValue={initialData?.currency || 'USD'}
                                    className="bg-background border border-border rounded-lg px-2 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                >
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <button
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-colors mt-4 disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : (transactionId ? 'Update Transaction' : 'Add Transaction')}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    )
}
