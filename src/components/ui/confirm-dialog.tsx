'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

type ConfirmOptions = {
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext)
    if (!confirm) {
        throw new Error('useConfirm must be used within a ConfirmProvider')
    }
    return confirm
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null)
    const [mounted, setMounted] = useState(false)
    const resolverRef = useRef<((value: boolean) => void) | null>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    const confirm = useCallback<ConfirmFn>((opts) => {
        return new Promise<boolean>((resolve) => {
            resolverRef.current?.(false)
            resolverRef.current = resolve
            setOptions(opts)
        })
    }, [])

    const close = (result: boolean) => {
        resolverRef.current?.(result)
        resolverRef.current = null
        setOptions(null)
    }

    useEffect(() => {
        if (!options) return
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(false)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [options])

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {mounted && options && createPortal(
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
                    onClick={() => close(false)}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-label={options.title}
                        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 space-y-3">
                            <div className="flex items-center gap-3">
                                {options.destructive !== false && (
                                    <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500 shrink-0">
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                )}
                                <h2 className="text-lg font-semibold text-foreground">{options.title}</h2>
                            </div>
                            {options.description && (
                                <p className="text-sm text-muted-foreground">{options.description}</p>
                            )}
                        </div>
                        <div className="px-6 pb-6 flex justify-end gap-3">
                            <button
                                onClick={() => close(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-foreground bg-background border border-border hover:bg-muted transition-colors"
                            >
                                {options.cancelLabel || 'Cancel'}
                            </button>
                            <button
                                autoFocus
                                onClick={() => close(true)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${options.destructive !== false
                                    ? 'bg-rose-600 hover:bg-rose-500'
                                    : 'bg-indigo-600 hover:bg-indigo-500'}`}
                            >
                                {options.confirmLabel || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </ConfirmContext.Provider>
    )
}
