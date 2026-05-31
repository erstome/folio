'use client'

import { useState } from 'react'
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import { parseXTBStatementAction, importXTBStatementAction } from '@/app/actions'
import { TransactionValidationTable, ParsedTransaction } from './TransactionValidationTable'

interface ImportXTBDialogProps {
    isOpen: boolean
    onClose: () => void
}

type Step = 'select' | 'validate' | 'importing' | 'complete'

export function ImportXTBDialog({ isOpen, onClose }: ImportXTBDialogProps) {
    const [file, setFile] = useState<File | null>(null)
    const [step, setStep] = useState<Step>('select')
    const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
    const [isParsing, setIsParsing] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [result, setResult] = useState<{
        success: boolean
        imported?: number
        skipped?: number
        errors?: string[]
        error?: string
    } | null>(null)

    if (!isOpen) return null

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'))) {
            setFile(selectedFile)
            setResult(null)
            setStep('select')
            setTransactions([])
            setSelectedIndices(new Set())
        } else {
            alert('Please select an Excel (.xlsx) file')
        }
    }

    const handleParse = async () => {
        if (!file) return
        setIsParsing(true)
        setResult(null)

        try {
            const reader = new FileReader()
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target?.result as string
                    const parseResult = await parseXTBStatementAction(base64Data)

                    if (parseResult.success && parseResult.transactions) {
                        setTransactions(parseResult.transactions)
                        setSelectedIndices(new Set(parseResult.transactions.map((_, i) => i)))
                        setStep('validate')
                    } else {
                        setResult({ success: false, error: parseResult.error || 'Failed to parse file' })
                    }
                } catch (error) {
                    setResult({ success: false, error: error instanceof Error ? error.message : 'Unknown error' })
                } finally {
                    setIsParsing(false)
                }
            }
            reader.onerror = () => {
                setResult({ success: false, error: 'Failed to read file' })
                setIsParsing(false)
            }
            reader.readAsDataURL(file)
        } catch (error) {
            setResult({ success: false, error: error instanceof Error ? error.message : 'Unknown error' })
            setIsParsing(false)
        }
    }

    const handleImport = async () => {
        if (!file || selectedIndices.size === 0) return
        setIsImporting(true)
        setStep('importing')
        setResult(null)

        try {
            const reader = new FileReader()
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target?.result as string
                    const indicesArray = Array.from(selectedIndices)
                    const importResult = await importXTBStatementAction(base64Data, file.name, indicesArray)
                    setResult(importResult)
                    setStep('complete')

                    if (importResult.success && importResult.imported && importResult.imported > 0) {
                        setTimeout(() => {
                            onClose()
                            setFile(null)
                            setTransactions([])
                            setSelectedIndices(new Set())
                            setStep('select')
                            setResult(null)
                            window.location.reload()
                        }, 2000)
                    }
                } catch (error) {
                    setResult({ success: false, error: error instanceof Error ? error.message : 'Unknown error' })
                    setStep('validate')
                } finally {
                    setIsImporting(false)
                }
            }
            reader.onerror = () => {
                setResult({ success: false, error: 'Failed to read file' })
                setIsImporting(false)
                setStep('validate')
            }
            reader.readAsDataURL(file)
        } catch (error) {
            setResult({ success: false, error: error instanceof Error ? error.message : 'Unknown error' })
            setIsImporting(false)
            setStep('validate')
        }
    }

    const handleClose = () => {
        if (step === 'complete' && result?.success) {
            window.location.reload()
        }
        onClose()
        setFile(null)
        setTransactions([])
        setSelectedIndices(new Set())
        setStep('select')
        setResult(null)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl ${
                step === 'validate' ? 'w-full max-w-5xl' : 'w-full max-w-md'
            } p-6`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5" />
                        Import XTB Statement
                    </h2>
                    <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    {step === 'select' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                    Select XTB Export File (.xlsx)
                                </label>
                                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-600 transition-colors">
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        id="xtb-file-input"
                                        disabled={isParsing}
                                    />
                                    <label htmlFor="xtb-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                                        <Upload className="w-8 h-8 text-zinc-500" />
                                        <span className="text-sm text-zinc-400">
                                            {file ? file.name : 'Click to select Excel file'}
                                        </span>
                                        <span className="text-xs text-zinc-600">
                                            Export from XTB → History → Cash Operations
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {result && !result.success && (
                                <div className="p-4 rounded-lg border bg-rose-500/10 border-rose-500/50">
                                    <div className="flex items-center gap-2 text-rose-400">
                                        <AlertCircle className="w-5 h-5" />
                                        <span>{result.error || 'Parse failed'}</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 justify-end pt-4">
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleParse}
                                    disabled={!file || isParsing}
                                    className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isParsing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Parsing...
                                        </>
                                    ) : (
                                        <>
                                            Parse File
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'validate' && (
                        <>
                            <TransactionValidationTable
                                transactions={transactions}
                                selectedIndices={selectedIndices}
                                onSelectionChange={setSelectedIndices}
                            />

                            <div className="flex gap-3 justify-end pt-4 border-t border-zinc-800">
                                <button
                                    onClick={() => { setStep('select'); setTransactions([]); setSelectedIndices(new Set()) }}
                                    className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                                    disabled={isImporting}
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleImport}
                                    disabled={selectedIndices.size === 0 || isImporting}
                                    className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isImporting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Importing...
                                        </>
                                    ) : (
                                        <>
                                            Import {selectedIndices.size} Transaction{selectedIndices.size !== 1 ? 's' : ''}
                                            <Upload className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}

                    {(step === 'importing' || step === 'complete') && result && (
                        <div className={`p-4 rounded-lg border ${
                            result.success
                                ? 'bg-emerald-500/10 border-emerald-500/50'
                                : 'bg-rose-500/10 border-rose-500/50'
                        }`}>
                            {result.success ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-emerald-400">
                                        <CheckCircle className="w-5 h-5" />
                                        <span className="font-medium">Import completed!</span>
                                    </div>
                                    <div className="text-sm text-zinc-300 space-y-1">
                                        <div>Imported: {result.imported} transactions</div>
                                        {result.skipped !== undefined && result.skipped > 0 && (
                                            <div>Skipped (already imported): {result.skipped}</div>
                                        )}
                                    </div>
                                    {result.errors && result.errors.length > 0 && (
                                        <div className="text-xs text-zinc-400 mt-2">
                                            <div className="font-medium mb-1">Errors:</div>
                                            {result.errors.map((error, i) => (
                                                <div key={i}>• {error}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-rose-400">
                                    <AlertCircle className="w-5 h-5" />
                                    <span>{result.error || 'Import failed'}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
