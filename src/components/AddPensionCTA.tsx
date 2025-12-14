'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddPensionDialog } from './AddPensionDialog'

export function AddPensionCTA() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-emerald-500/20"
            >
                <Plus className="w-4 h-4" />
                Add Fund
            </button>
            <AddPensionDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    )
}
