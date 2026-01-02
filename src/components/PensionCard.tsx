'use client'

import { useState } from 'react'
import { PiggyBank, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { EditPensionDialog } from './EditPensionDialog'
import { AddContributionDialog } from './AddContributionDialog'
import { deleteAsset } from '@/app/actions'

type Pension = {
    id: string
    name: string
    totalValue: number
    currency: string
    isTaxAdvantaged: boolean
    currentYearContributions: number
}

export function PensionCard({ pension }: { pension: Pension }) {
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isAddOpen, setIsAddOpen] = useState(false)

    function formatCurrency(val: number) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: pension.currency }).format(val)
    }

    // Tax Logic
    const TAX_LIMIT = 2000
    const progress = Math.min(100, (pension.currentYearContributions / TAX_LIMIT) * 100)
    const remaining = Math.max(0, TAX_LIMIT - pension.currentYearContributions)

    async function handleDelete() {
        if (confirm('Are you sure you want to delete this fund? This action cannot be undone.')) {
            await deleteAsset(pension.id)
        }
    }

    return (
        <>
            <div className="bg-card border border-border rounded-xl p-6 space-y-4 hover:border-border/80 transition-colors group relative">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={handleDelete}
                        className="p-2 text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors"
                        title="Delete Fund"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsEditOpen(true)}
                        className="p-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                        title="Edit Details"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="p-2 text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors"
                        title="Add Contribution"
                    >
                        <PlusCircle className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-start justify-between">
                    <div className="p-3 bg-muted rounded-lg">
                        <PiggyBank className="w-6 h-6 text-emerald-500" />
                    </div>
                </div>

                <div>
                    <h3 className="font-semibold text-foreground truncate pr-16">{pension.name}</h3>
                    <p className="text-sm text-muted-foreground">{pension.isTaxAdvantaged ? 'Tax Advantaged (PPR)' : 'Retirement Fund'}</p>
                </div>

                <div className="pt-2">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Value</div>
                    <div className="text-2xl font-bold text-foreground mt-1">
                        {formatCurrency(pension.totalValue)}
                    </div>
                </div>

                {pension.isTaxAdvantaged && (
                    <div className="pt-4 border-t border-border/50 space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Tax Deduction Usage ({new Date().getFullYear()})</span>
                            <span className={progress >= 100 ? "text-emerald-500 font-medium" : "text-foreground/80"}>
                                {Math.round(progress)}%
                            </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {progress >= 100
                                ? "Max deduction reached! 🎉"
                                : `${formatCurrency(remaining)} remaining to max deduction`
                            }
                        </div>
                    </div>
                )}
            </div>

            <EditPensionDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                initialData={{
                    id: pension.id,
                    name: pension.name,
                    isTaxAdvantaged: pension.isTaxAdvantaged
                }}
            />

            <AddContributionDialog
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                pensionId={pension.id}
                pensionName={pension.name}
                currency={pension.currency}
            />
        </>
    )
}
