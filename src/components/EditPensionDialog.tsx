'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Loader2, X } from 'lucide-react'
import { updatePension } from '@/app/actions'
import { useRouter } from 'next/navigation'

interface EditPensionDialogProps {
    isOpen: boolean
    onClose: () => void
    initialData: {
        id: string
        name: string
        isTaxAdvantaged: boolean
    }
}

export function EditPensionDialog({ isOpen, onClose, initialData }: EditPensionDialogProps) {
    const [name, setName] = useState(initialData.name)
    const [isTaxAdvantaged, setIsTaxAdvantaged] = useState(initialData.isTaxAdvantaged)
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    // Reset state when opening/initialData changes
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (isOpen) {
            setName(initialData.name)
            setIsTaxAdvantaged(initialData.isTaxAdvantaged)
        }
    }, [isOpen, initialData])

    if (!isOpen || !mounted) return null

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setIsLoading(true)

        await updatePension(initialData.id, {
            name,
            isTaxAdvantaged
        })

        setIsLoading(false)
        router.refresh()
        onClose()
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <Pencil className="w-5 h-5 text-indigo-500" />
                        Edit Fund Details
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Fund Name</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-background border border-border rounded-lg">
                        <div className="space-y-0.5">
                            <label className="block text-sm font-medium text-foreground">Tax Advantaged (PPR)</label>
                            <p className="text-xs text-muted-foreground">Track for 2,000€ tax deduction limit</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isTaxAdvantaged}
                                onChange={(e) => setIsTaxAdvantaged(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
