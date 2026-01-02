'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PlusCircle, Loader2, X } from 'lucide-react'
import { addPensionContribution } from '@/app/actions'

interface AddContributionDialogProps {
    isOpen: boolean
    onClose: () => void
    pensionId: string
    pensionName: string
    currency: string
}

export function AddContributionDialog({ isOpen, onClose, pensionId, pensionName, currency }: AddContributionDialogProps) {
    const [amount, setAmount] = useState('')
    const [quantity, setQuantity] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [isLoading, setIsLoading] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)

        await addPensionContribution(pensionId, parseFloat(amount), parseFloat(quantity), new Date(date))

        setIsLoading(false)
        setAmount('')
        setQuantity('')
        onClose()
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <PlusCircle className="w-5 h-5 text-emerald-500" />
                        Add Contribution
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="text-sm text-muted-foreground">
                    Adding funds to <span className="text-foreground font-medium">{pensionName}</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Amount ({currency})</label>
                            <input
                                type="number"
                                step="any"
                                required
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity (Units)</label>
                            <input
                                type="number"
                                step="any"
                                required
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                placeholder="0.000"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
                        <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
