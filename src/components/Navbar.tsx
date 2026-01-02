'use client'

import Link from "next/link"
import { CurrencySwitcher } from "@/components/CurrencySwitcher"
import { HeaderActions } from "@/components/HeaderActions"
import { ReactNode } from "react"

export function Navbar({ children }: { children?: ReactNode }) {
    return (
        <nav className="border-b border-border bg-background/50 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <Link href="/" className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white/90">
                        F
                    </div>
                    Folio
                </Link>
                <div className="flex items-center gap-4">
                    {/* Optional children actions (like specific page actions) */}
                    {children}

                    <CurrencySwitcher />
                    <HeaderActions />
                </div>
            </div>
        </nav>
    )
}
