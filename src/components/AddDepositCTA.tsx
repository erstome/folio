'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddDepositDialog } from './AddDepositDialog'

export function AddDepositCTA() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20"
            >
                <Plus className="w-4 h-4" />
                Add Deposit
            </button>
            <AddDepositDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    )
}
