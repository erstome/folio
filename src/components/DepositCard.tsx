'use client'

import { useState } from 'react'
import { PiggyBank, Calendar, Clock, Landmark, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { EditDepositDialog } from './EditDepositDialog'
import { AddDepositDialog } from './AddDepositDialog'
import { deleteAsset } from '@/app/actions'


export type Deposit = {
    id: string
    bankName: string
    name: string | null
    principal: number
    currency: string
    rate: number
    startDate: Date
    maturityDate: Date
    accruedInterest: number
    totalValue: number
    progress: number
}

function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function formatDate(date: Date) {
    return new Date(date).toLocaleDateString('en-GB')
}

export function DepositCard({ deposit }: { deposit: Deposit }) {
    const [showNet, setShowNet] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isRenewOpen, setIsRenewOpen] = useState(false)

    // Calculate Net Interest (28% Tax)
    const taxRate = 0.28
    const netInterest = deposit.accruedInterest * (1 - taxRate)

    async function handleDelete() {
        if (confirm('Are you sure you want to delete this deposit? This action cannot be undone.')) {
            await deleteAsset(deposit.id)
        }
    }

    const isMatured = deposit.progress >= 100

    return (
        <>
            <div className={`bg-card border rounded-xl p-6 space-y-4 transition-colors group relative ${isMatured ? 'border-emerald-500/50 hover:border-emerald-500' : 'border-border hover:border-border/80'}`}>
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isMatured && (
                        <button
                            onClick={() => setIsRenewOpen(true)}
                            className="p-2 text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-2"
                            title="Renew / Rollover Deposit"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span className="text-xs font-bold">RENEW</span>
                        </button>
                    )}
                    <button
                        onClick={handleDelete}
                        className="p-2 text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors"
                        title="Delete Deposit"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsEditOpen(true)}
                        className="p-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                        title="Edit Deposit"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isMatured ? 'bg-emerald-500/10 text-emerald-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                            <Landmark className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground">{deposit.bankName}</h3>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                {deposit.name}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-border/50">
                    <div className="space-y-1">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Principal</div>
                        <div className="font-mono text-foreground/80">{formatCurrency(deposit.principal, deposit.currency)}</div>
                    </div>
                    <div className="space-y-1 text-right">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Rate (TAN)</div>
                        <div className="font-mono text-zinc-300">{deposit.rate}%</div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Start
                        </div>
                        <div className="text-muted-foreground text-sm">{formatDate(deposit.startDate)}</div>
                    </div>
                    <div className="space-y-1 text-right">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3" /> Maturity
                        </div>
                        <div className="text-muted-foreground text-sm">{formatDate(deposit.maturityDate)}</div>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-background p-3 rounded-lg border border-border/50">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Interest</span>
                        <button
                            onClick={() => setShowNet(!showNet)}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors border ${showNet ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}
                        >
                            {showNet ? 'NET (28%)' : 'GROSS'}
                        </button>
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-bold text-foreground">
                            +{formatCurrency(showNet ? netInterest : deposit.accruedInterest, deposit.currency)}
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{Math.round(deposit.progress)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ease-in-out ${isMatured ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${deposit.progress}%` }}
                        />
                    </div>
                </div>
            </div>

            <EditDepositDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                initialData={{
                    id: deposit.id,
                    bankName: deposit.bankName,
                    name: deposit.name || '',
                    amount: deposit.principal,
                    currency: deposit.currency,
                    interestRate: deposit.rate,
                    startDate: new Date(deposit.startDate).toISOString().split('T')[0],
                    maturityDate: new Date(deposit.maturityDate).toISOString().split('T')[0],
                }}
            />

            <AddDepositDialog
                isOpen={isRenewOpen}
                onClose={() => setIsRenewOpen(false)}
                initialData={{
                    amount: Number(deposit.totalValue.toFixed(2)),
                    bankName: deposit.bankName,
                    currency: deposit.currency,
                    interestRate: deposit.rate,
                    startDate: deposit.maturityDate, // Rollover from maturity date
                }}
                renewalValues={{
                    gross: Number(deposit.totalValue.toFixed(2)),
                    net: Number((deposit.principal + netInterest).toFixed(2))
                }}
            />
        </>
    )
}
