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
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button
                onClick={() => toggleCurrency('USD')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${currency === 'USD'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
            >
                USD
            </button>
            <button
                onClick={() => toggleCurrency('EUR')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${currency === 'EUR'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                    }`}
            >
                EUR
            </button>
        </div>
    )
}
