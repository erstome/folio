import { getPensions } from '@/app/actions'
import { PensionCard } from '@/components/PensionCard'
import { AddPensionCTA } from '@/components/AddPensionCTA'
import { Navbar } from '@/components/Navbar'
import { PiggyBank, Briefcase } from 'lucide-react'

// Server Component
export default async function PensionPage() {
    const pensions = await getPensions()
    const totalPensionValue = pensions.reduce((sum, p) => sum + p.totalValue, 0)

    function formatCurrency(val: number) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(val)
    }

    return (
        <div className="min-h-screen pb-20">
            <Navbar />

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
                            <Briefcase className="w-8 h-8 text-emerald-500" />
                            Retirement & PPR
                        </h2>
                        <p className="text-muted-foreground mt-1">Track your long-term savings and pension funds.</p>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Retirement Savings</div>
                        <div className="mt-2 text-3xl font-bold text-foreground tracking-tight">{formatCurrency(totalPensionValue)}</div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Number of Funds</div>
                        <div className="mt-2 text-3xl font-bold text-emerald-500 tracking-tight">{pensions.length}</div>
                    </div>
                </div>

                {/* List */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">Your Funds</h3>
                    {pensions.length === 0 ? (
                        <div className="text-center py-20 bg-muted/20 border border-border rounded-xl border-dashed">
                            <PiggyBank className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-muted-foreground font-medium">No retirement funds found</h3>
                            <p className="text-muted-foreground text-sm mt-1">Add a PPR or pension fund to start tracking.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {pensions.map(pension => (
                                <PensionCard key={pension.id} pension={pension} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
