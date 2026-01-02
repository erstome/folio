'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Plus, LineChart, Landmark, PiggyBank, X, Sun, Moon, Database } from 'lucide-react'
import { AddTransactionDialog } from './AddTransactionDialog'
import { AddDepositDialog } from './AddDepositDialog'
import { AddPensionDialog } from './AddPensionDialog'
import { DataManagementDialog } from './DataManagementDialog'

export function HeaderActions() {
    const pathname = usePathname()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [theme, setTheme] = useState<'light' | 'dark'>('dark')

    useEffect(() => {
        setMounted(true);
        const savedTheme = localStorage.getItem('folio-theme') as 'light' | 'dark';
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.classList.toggle('dark', savedTheme === 'dark');
        } else {
            // Default to dark as it matches the app's vibe
            document.documentElement.classList.add('dark');
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('folio-theme', newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
    };

    // Dialog States
    const [isTransactionOpen, setIsTransactionOpen] = useState(false)
    const [isDepositOpen, setIsDepositOpen] = useState(false)
    const [isPensionOpen, setIsPensionOpen] = useState(false)
    const [isDataManagementOpen, setIsDataManagementOpen] = useState(false)

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
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setIsDataManagementOpen(true)}
                    className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                    title="Data Management (Backup/Restore)"
                >
                    <Database className="w-5 h-5" />
                </button>
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                >
                    {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
                <button
                    onClick={config.action}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white ${config.color}`}
                >
                    <Plus className="w-4 h-4" />
                    {config.label}
                </button>
            </div>

            {/* Dashboard Selection Menu Modal */}
            {isMenuOpen && mounted && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6 shadow-2xl space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-bold text-foreground">Add New</h2>
                            <button onClick={() => setIsMenuOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => { setIsMenuOpen(false); setIsTransactionOpen(true); }}
                                className="w-full p-4 bg-background border border-border hover:bg-muted/50 rounded-xl transition-all group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <LineChart className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-foreground">Investment</div>
                                        <div className="text-xs text-muted-foreground">Stock, ETF or Crypto</div>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </button>

                            <button
                                onClick={() => { setIsMenuOpen(false); setIsDepositOpen(true); }}
                                className="w-full p-4 bg-background border border-border hover:bg-muted/50 rounded-xl transition-all group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Landmark className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-foreground">Bank Deposit</div>
                                        <div className="text-xs text-muted-foreground">Term or Savings</div>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </button>

                            <button
                                onClick={() => { setIsMenuOpen(false); setIsPensionOpen(true); }}
                                className="w-full p-4 bg-background border border-border hover:bg-muted/50 rounded-xl transition-all group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <PiggyBank className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-foreground">Pension Fund</div>
                                        <div className="text-xs text-muted-foreground">PPR or Retirement</div>
                                    </div>
                                </div>
                                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
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
            <DataManagementDialog isOpen={isDataManagementOpen} onClose={() => setIsDataManagementOpen(false)} />
        </>
    )
}
