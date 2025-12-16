'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Plus, LineChart, Landmark, PiggyBank, X } from 'lucide-react'
import { AddTransactionDialog } from './AddTransactionDialog'
import { AddDepositDialog } from './AddDepositDialog'
import { AddPensionDialog } from './AddPensionDialog'

export function HeaderActions() {
    const pathname = usePathname()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true);
    }, []);

    // Dialog States
    const [isTransactionOpen, setIsTransactionOpen] = useState(false)
    const [isDepositOpen, setIsDepositOpen] = useState(false)
    const [isPensionOpen, setIsPensionOpen] = useState(false)

    // Specific contexts
    const isDashboard = pathname === '/'
    const isInvestments = pathname === '/investments'
    const isDeposits = pathname === '/deposits'
    const isPension = pathname === '/pension'

    // Button Configuration based on path
    const getButtonConfig = () => {
        if (isInvestments) {
            return {
                label: 'Add Investment',
                color: 'bg-indigo-600 hover:bg-indigo-500',
                action: () => setIsTransactionOpen(true)
            }
        }
        if (isDeposits) {
            return {
                label: 'Add Deposit',
                color: 'bg-emerald-600 hover:bg-emerald-500',
                action: () => setIsDepositOpen(true)
            }
        }
        if (isPension) {
            return {
                label: 'Add Fund',
                color: 'bg-amber-600 hover:bg-amber-500',
                action: () => setIsPensionOpen(true)
            }
        }
        // Default / Dashboard
        return {
            label: 'Add Action',
            color: 'bg-indigo-600 hover:bg-indigo-500',
            action: () => setIsMenuOpen(true)
        }
    }

    const config = getButtonConfig()

    return (
        <>
            <button
                onClick={config.action}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white ${config.color}`}
            >
                <Plus className="w-4 h-4" />
                {config.label}
            </button>

            {/* Dashboard Selection Menu Modal */}
            {isMenuOpen && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-2xl space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-bold text-white">Add New</h2>
                            <button onClick={() => setIsMenuOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => { setIsMenuOpen(false); setIsTransactionOpen(true); }}
                                className="w-full p-4 bg-zinc-950/50 border border-zinc-800 hover:bg-zinc-900 rounded-xl transition-all group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <LineChart className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-white">Investment</div>
                                        <div className="text-xs text-zinc-500">Stock, ETF or Crypto</div>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                            </button>

                            <button
                                onClick={() => { setIsMenuOpen(false); setIsDepositOpen(true); }}
                                className="w-full p-4 bg-zinc-950/50 border border-zinc-800 hover:bg-zinc-900 rounded-xl transition-all group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Landmark className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-white">Bank Deposit</div>
                                        <div className="text-xs text-zinc-500">Term or Savings</div>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                            </button>

                            <button
                                onClick={() => { setIsMenuOpen(false); setIsPensionOpen(true); }}
                                className="w-full p-4 bg-zinc-950/50 border border-zinc-800 hover:bg-zinc-900 rounded-xl transition-all group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <PiggyBank className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-white">Pension Fund</div>
                                        <div className="text-xs text-zinc-500">PPR or Retirement</div>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Dialogs */}
            <AddTransactionDialog isOpen={isTransactionOpen} onClose={() => setIsTransactionOpen(false)} />
            <AddDepositDialog isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} />
            <AddPensionDialog isOpen={isPensionOpen} onClose={() => setIsPensionOpen(false)} />
        </>
    )
}
