import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { addDeposit } from '@/app/actions'
import { DepositData } from '@/app/types'

interface AddDepositDialogProps {
    isOpen: boolean
    onClose: () => void
    initialData?: Partial<DepositData>
    renewalValues?: { gross: number, net: number }
}

export function AddDepositDialog({ isOpen, onClose, initialData, renewalValues }: AddDepositDialogProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Rollover logic
    const [rolloverType, setRolloverType] = useState<'GROSS' | 'NET'>('GROSS')
    const currentAmount = renewalValues ? renewalValues[rolloverType.toLowerCase() as 'gross' | 'net'] : (initialData?.amount || '')

    // Reset to GROSS when dialog opens/renewalValues change
    useEffect(() => {
        if (isOpen) setRolloverType('GROSS')
    }, [isOpen])

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
            const data = {
                amount: parseFloat(formData.get('amount') as string),
                bankName: formData.get('bankName') as string,
                currency: formData.get('currency') as string,
                interestRate: parseFloat(formData.get('interestRate') as string),
                startDate: new Date(formData.get('startDate') as string),
                maturityDate: new Date(formData.get('maturityDate') as string),
            }

            const result = await addDeposit(data)

            if (result.success) {
                onClose()
            } else {
                setError('Failed to save deposit.')
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

    // Default dates for new deposit vs rollover
    // If rollover, start date is provided. If new, today.
    const defaultStart = initialData?.startDate
        ? new Date(initialData.startDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]

    // For maturity, if rollover, we might want to default to Start + 1 Year
    // or keep the logic simple and force user to pick?
    // Let's see if initialData provides a maturity. If so, use it.
    // Otherwise empty?
    const defaultMaturity = initialData?.maturityDate
        ? new Date(initialData.maturityDate).toISOString().split('T')[0]
        : ''

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-foreground">{initialData ? 'Renew Deposit' : 'New Term Deposit'}</h2>
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

                    {/* Rollover Toggle */}
                    {renewalValues && (
                        <div className="bg-background p-3 rounded-lg border border-border space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rollover Amount</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRolloverType('GROSS')}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-colors border ${rolloverType === 'GROSS' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}
                                >
                                    GROSS: {renewalValues.gross.toFixed(2)}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRolloverType('NET')}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-colors border ${rolloverType === 'NET' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}
                                >
                                    NET (28% Tax): {renewalValues.net.toFixed(2)}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Bank Name</label>
                        <input
                            type="text"
                            name="bankName"
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-muted-foreground"
                            placeholder="e.g. Santander"
                            defaultValue={initialData?.bankName}
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
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                defaultValue={currentAmount}
                                key={currentAmount} // Force re-render on toggle
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Currency</label>
                            <select
                                name="currency"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                defaultValue={initialData?.currency || 'EUR'}
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
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            placeholder="e.g. 2.50"
                            defaultValue={initialData?.interestRate}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                            <input
                                type="date"
                                name="startDate"
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                defaultValue={defaultStart}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Maturity Date</label>
                            <input
                                type="date"
                                name="maturityDate"
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
                            {loading ? 'Creating...' : 'Create Deposit'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
