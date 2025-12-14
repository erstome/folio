import { getDeposits } from '@/app/actions'
import { DepositCard } from '@/components/DepositCard'
import { AddDepositCTA } from '@/components/AddDepositCTA'
import { HeaderActions } from '@/components/HeaderActions'
import { CurrencySwitcher } from '@/components/CurrencySwitcher'
import { Navbar } from '@/components/Navbar'
import { Wallet } from 'lucide-react'

// Server Component
export default async function DepositsPage() {
    const deposits = await getDeposits()

    function formatCurrency(val: number) {
        // Defaulting to EUR for aggregation if mixed, in real app should normalize.
        // Assuming EUR for MVP or using the first deposit's currency as heuristic
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(val)
    }

    const activeDeposits = deposits.filter(d => d.progress < 100)
    const maturedDeposits = deposits.filter(d => d.progress === 100)

    // Calculate stats
    // Total Deposited should ONLY reflect Active deposits (current liquid cash in bank)
    // Matured deposits are either withdrawn or rolled over (which creates a new active one)
    const totalDepositsValue = activeDeposits.reduce((sum, d) => sum + d.principal, 0)

    // Lifetime Interest: Active (Accrued) + Matured (Final/Paid)
    const totalInterest = deposits.reduce((sum, d) => sum + d.accruedInterest, 0)

    return (
        <div className="min-h-screen pb-20">
            <Navbar />

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                            <Wallet className="w-8 h-8 text-indigo-500" />
                            Bank Deposits
                        </h2>
                        <p className="text-zinc-400 mt-1">Manage your fixed-term savings and maturity dates.</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <div className="text-sm text-zinc-500 font-medium uppercase tracking-wider">Total Deposited</div>
                        <div className="mt-2 text-3xl font-bold text-white tracking-tight">{formatCurrency(totalDepositsValue)}</div>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <div className="text-sm text-zinc-500 font-medium uppercase tracking-wider">Accrued (Gross)</div>
                        <div className="mt-2 text-3xl font-bold text-emerald-500 tracking-tight">+{formatCurrency(totalInterest)}</div>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <div className="text-sm text-zinc-500 font-medium uppercase tracking-wider">Accrued (Net)</div>
                        <div className="mt-2 text-3xl font-bold text-emerald-400 tracking-tight">+{formatCurrency(totalInterest * 0.72)}</div>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
                        <div className="text-sm text-zinc-500 font-medium uppercase tracking-wider">Active Contracts</div>
                        <div className="mt-2 text-3xl font-bold text-white tracking-tight">{activeDeposits.length}</div>
                    </div>
                </div>

                {/* Active List */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white">Active Deposits</h3>
                    {activeDeposits.length === 0 ? (
                        <div className="text-center py-10 bg-zinc-900/20 border border-zinc-800/50 rounded-xl border-dashed">
                            <Wallet className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                            <h3 className="text-zinc-400 font-medium text-sm">No active deposits</h3>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activeDeposits.map(deposit => (
                                <DepositCard key={deposit.id} deposit={deposit} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Matured List */}
                {maturedDeposits.length > 0 && (
                    <div className="space-y-4 pt-8 border-t border-zinc-800/50">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-zinc-400">Matured History</h3>
                            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-zinc-500 font-medium">{maturedDeposits.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80 hover:opacity-100 transition-opacity">
                            {maturedDeposits.map(deposit => (
                                <DepositCard key={deposit.id} deposit={deposit} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
