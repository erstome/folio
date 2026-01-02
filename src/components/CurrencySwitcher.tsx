'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export function CurrencySwitcher() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const currency = searchParams.get('currency') || 'EUR'

    const toggleCurrency = (newCurrency: string) => {
        const params = new URLSearchParams(searchParams)
        params.set('currency', newCurrency)
        router.push(`${pathname}?${params.toString()}`)
    }

    return (
        <div className="flex items-center bg-card border border-border rounded-lg p-1">
            <button
                onClick={() => toggleCurrency('USD')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${currency === 'USD'
                    ? 'bg-muted text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
            >
                USD
            </button>
            <button
                onClick={() => toggleCurrency('EUR')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${currency === 'EUR'
                    ? 'bg-muted text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
            >
                EUR
            </button>
        </div>
    )
}
