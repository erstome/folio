'use client'

import { useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

export interface ParsedTransaction {
  date: Date
  type: string
  description: string
  symbol?: string
  quantity?: number
  amount: number
  currency: string
  assetName?: string
}

interface TransactionValidationTableProps {
  transactions: ParsedTransaction[]
  selectedIndices: Set<number>
  onSelectionChange: (indices: Set<number>) => void
}

export function TransactionValidationTable({ 
  transactions, 
  selectedIndices, 
  onSelectionChange 
}: TransactionValidationTableProps) {
  const toggleSelection = (index: number) => {
    const newSelection = new Set(selectedIndices)
    if (newSelection.has(index)) {
      newSelection.delete(index)
    } else {
      newSelection.add(index)
    }
    onSelectionChange(newSelection)
  }

  const selectAll = () => {
    onSelectionChange(new Set(transactions.map((_, i) => i)))
  }

  const selectNone = () => {
    onSelectionChange(new Set())
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
  }

  const calculatePrice = (tx: ParsedTransaction) => {
    if (tx.quantity && tx.quantity > 0) {
      return tx.amount / tx.quantity
    }
    return 0
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          Found {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Select All
          </button>
          <span className="text-zinc-600">|</span>
          <button
            onClick={selectNone}
            className="text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Select None
          </button>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium w-12">
                  <input
                    type="checkbox"
                    checked={selectedIndices.size === transactions.length && transactions.length > 0}
                    onChange={(e) => e.target.checked ? selectAll() : selectNone()}
                    className="rounded border-zinc-600 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Date</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Type</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">ISIN</th>
                <th className="px-4 py-3 text-left text-zinc-400 font-medium">Asset</th>
                <th className="px-4 py-3 text-right text-zinc-400 font-medium">Quantity</th>
                <th className="px-4 py-3 text-right text-zinc-400 font-medium">Price</th>
                <th className="px-4 py-3 text-right text-zinc-400 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {transactions.map((tx, index) => {
                const isSelected = selectedIndices.has(index)
                const price = calculatePrice(tx)
                const isValid = tx.symbol && tx.quantity && tx.quantity > 0 && tx.amount > 0

                return (
                  <tr
                    key={index}
                    className={`hover:bg-zinc-800/30 transition-colors ${isSelected ? 'bg-zinc-800/20' : ''} ${!isValid ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(index)}
                        disabled={!isValid}
                        className="rounded border-zinc-600 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{formatDate(tx.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        tx.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' :
                        tx.type === 'SELL' ? 'bg-rose-500/10 text-rose-400' :
                        'bg-zinc-500/10 text-zinc-400'
                      }`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{tx.symbol || '-'}</td>
                    <td className="px-4 py-3 text-zinc-300">
                      <div className="max-w-xs truncate" title={tx.assetName || tx.description}>
                        {tx.assetName || tx.description || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">{tx.quantity?.toFixed(6) || '-'}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{price > 0 ? formatCurrency(price) : '-'}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 font-medium">
                      {formatCurrency(tx.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {transactions.length === 0 && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          No transactions found in the PDF
        </div>
      )}
    </div>
  )
}


