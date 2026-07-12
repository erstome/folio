'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ImportXTBDialog } from './ImportXTBDialog'

export function ImportXTBButton() {
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsDialogOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-zinc-800 hover:bg-zinc-700 text-white"
            >
                <Upload className="w-4 h-4" />
                Import XTB
            </button>
            <ImportXTBDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
            />
        </>
    )
}
