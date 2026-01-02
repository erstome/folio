'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Loader2, X } from 'lucide-react'
import { updateDeposit } from '@/app/actions'
import { DepositData } from '@/app/types'

interface EditDepositDialogProps {
    isOpen: boolean
    onClose: () => void
    initialData: {
        id: string
        name: string
        amount: number
        currency: string
        interestRate: number
        maturityDate: string // YYYY-MM-DD
        startDate: string // YYYY-MM-DD
        bankName: string
    }
}

export function EditDepositDialog({ isOpen, onClose, initialData }: EditDepositDialogProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setError('')

        const formData = new FormData(e.currentTarget)
        const start = new Date(formData.get('startDate') as string)
        const maturity = new Date(formData.get('maturityDate') as string)

        if (maturity <= start) {
            setError('Maturity date must be after start date.')
            setLoading(false)
            return
        }

        try {
            const data: DepositData = {
                amount: parseFloat(formData.get('amount') as string),
                bankName: formData.get('bankName') as string,
                currency: formData.get('currency') as string,
                interestRate: parseFloat(formData.get('interestRate') as string),
                startDate: new Date(formData.get('startDate') as string),
                maturityDate: new Date(formData.get('maturityDate') as string),
                name: formData.get('bankName') as string, // Using bankName as name for now or could have separate field
            }

            // In our current action signature, updateDeposit takes assetId and data
            // We need to ensure updateDeposit is waiting for this data structure.
            await updateDeposit(initialData.id, data)
            onClose()
        } catch (err) {
            console.error(err)
            setError('Failed to update deposit.')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen || !mounted) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-foreground">Edit Deposit</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-500 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Bank Name</label>
                        <input
                            type="text"
                            name="bankName"
                            defaultValue={initialData.bankName}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-muted-foreground"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Amount</label>
                            <input
                                type="number"
                                name="amount"
                                step="any"
                                defaultValue={initialData.amount}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Currency</label>
                            <select
                                name="currency"
                                defaultValue={initialData.currency}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            >
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Interest Rate (TAN %)</label>
                        <input
                            type="number"
                            name="interestRate"
                            step="0.01"
                            defaultValue={initialData.interestRate}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                            <input
                                type="date"
                                name="startDate"
                                defaultValue={initialData.startDate}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Maturity Date</label>
                            <input
                                type="date"
                                name="maturityDate"
                                defaultValue={initialData.maturityDate}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                required
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
