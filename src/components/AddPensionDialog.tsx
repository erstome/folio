'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { addPension } from '@/app/actions'

interface AddPensionDialogProps {
    isOpen: boolean
    onClose: () => void
}

export function AddPensionDialog({ isOpen, onClose }: AddPensionDialogProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setLoading(true)
        setError('')

        const formData = new FormData(e.currentTarget)

        try {
            const data = {
                name: formData.get('name') as string,
                investedAmount: parseFloat(formData.get('investedAmount') as string),
                currentValue: parseFloat(formData.get('currentValue') as string),
                quantity: parseFloat(formData.get('quantity') as string),
                currency: formData.get('currency') as string,
                isTaxAdvantaged: formData.get('isTaxAdvantaged') === 'on',
            }

            const result = await addPension(data)

            if (result.success) {
                onClose()
            } else {
                // @ts-ignore
                setError(result.error || 'Failed to save pension.')
            }
        } catch (err) {
            setError('Invalid form data.')
        } finally {
            setLoading(false)
        }
    }

    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-foreground">Add Pension Fund</h2>
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
                        <label className="text-xs font-medium text-muted-foreground">Fund Name</label>
                        <input
                            type="text"
                            name="name"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-muted-foreground"
                            placeholder="e.g. PPR Alves Ribeiro"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Total Invested (€)</label>
                            <input
                                type="number"
                                name="investedAmount"
                                step="0.01"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                placeholder="Total cash put in"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Current Value (€)</label>
                            <input
                                type="number"
                                name="currentValue"
                                step="0.01"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                placeholder="Current balance"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Quantity (Units)</label>
                            <input
                                type="number"
                                name="quantity"
                                step="0.0001"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                placeholder="e.g. 154.32"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Currency</label>
                            <select
                                name="currency"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            >
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <div className="flex items-center h-5">
                            <input
                                id="tax-advantaged"
                                name="isTaxAdvantaged"
                                type="checkbox"
                                className="w-4 h-4 rounded border-border bg-background text-indigo-600 focus:ring-indigo-500/50 focus:ring-offset-0"
                            />
                        </div>
                        <label htmlFor="tax-advantaged" className="text-sm text-muted-foreground">
                            Is Tax Advantaged? (PPR benefits)
                        </label>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creating...' : 'Add Fund'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
