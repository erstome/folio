'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LayoutDashboard, Wallet, PiggyBank, Briefcase, LineChart, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOutAction } from '@/app/auth-actions'

const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Investments', href: '/investments', icon: LineChart },
    { name: 'Bank Deposits', href: '/deposits', icon: Wallet },
    { name: 'Retirement', href: '/pension', icon: PiggyBank },
]

export function Sidebar({ userEmail }: { userEmail?: string | null }) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const currency = searchParams.get('currency') || 'EUR' // Default to EUR now

    if (pathname === '/login') return null

    return (
        <div className="flex flex-col w-64 border-r border-border bg-card h-screen sticky top-0">
            <div className="p-6">
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Briefcase className="w-6 h-6 text-indigo-500" />
                    Folio
                </h1>
            </div>
            <nav className="flex-1 px-4 space-y-1">
                {navigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            href={`${item.href}?currency=${currency}`}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                                isActive
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>
            <div className="p-4 border-t border-border space-y-3">
                {userEmail && (
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground truncate" title={userEmail}>
                            {userEmail}
                        </span>
                        <button
                            onClick={() => signOutAction()}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            title="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                )}
                <div className="text-xs text-muted-foreground text-center">
                    v0.2.0 Phase 2
                </div>
            </div>
        </div>
    )
}
