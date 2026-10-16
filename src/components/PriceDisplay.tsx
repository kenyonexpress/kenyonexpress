'use client'

import { shekelsFromIls } from '@/lib/money-format'
import { useState } from 'react'

export interface PriceDisplayProps {
  /** Current/sale price in ILS (shekels) */
  price: number
  /** Original/full price in ILS, if on sale */
  originalPrice?: number | null
  /** Show savings badge with amount and percentage */
  showSavingsBadge?: boolean
  /** Allow toggling between Arabic (1,2,3) and Hebrew (א,ב,ג) numerals */
  allowHebrewNumerals?: boolean
  /** CSS class for the container */
  className?: string
  /** CSS class for the price text */
  priceClassName?: string
}

/** Converts Arabic numerals to Hebrew numerals */
function toHebrewNumerals(text: string): string {
  const arabicToHebrew: Record<string, string> = {
    '0': '٠',
    '1': 'א',
    '2': 'ב',
    '3': 'ג',
    '4': 'ד',
    '5': 'ה',
    '6': 'ו',
    '7': 'ז',
    '8': 'ח',
    '9': 'ט',
  }

  return text.replace(/\d/g, (digit) => arabicToHebrew[digit] ?? digit)
}

/** Format price for display, optionally using Hebrew numerals */
function formatPrice(price: number, useHebrewNumerals = false): string {
  const formatted = shekelsFromIls(price)
  return useHebrewNumerals ? toHebrewNumerals(formatted) : formatted
}

export default function PriceDisplay({
  price,
  originalPrice,
  showSavingsBadge = true,
  allowHebrewNumerals = true,
  className = '',
  priceClassName = 'text-base font-bold text-price',
}: PriceDisplayProps) {
  const [useHebrewNumerals, setUseHebrewNumerals] = useState(false)

  const isOnSale = originalPrice != null && originalPrice > price
  const savings = isOnSale ? originalPrice - price : 0

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          {isOnSale && originalPrice != null && (
            <span className="text-sm text-muted line-through">
              {formatPrice(originalPrice, useHebrewNumerals)}
            </span>
          )}
          <span className={isOnSale ? priceClassName : 'text-base font-bold text-deal-price'}>
            {formatPrice(price, useHebrewNumerals)}
          </span>
        </div>

        {isOnSale && showSavingsBadge && (
          <div className="inline-flex items-center gap-1 rounded-full bg-sale-badge px-2 py-1 text-xs font-semibold text-white">
            <span>חוסכים {formatPrice(savings, useHebrewNumerals)}</span>
          </div>
        )}
      </div>

      {allowHebrewNumerals && (
        <button
          type="button"
          onClick={() => setUseHebrewNumerals(!useHebrewNumerals)}
          className="mt-2 text-xs text-muted hover:text-heading transition-colors"
          aria-label={useHebrewNumerals ? 'Switch to Arabic numerals' : 'Switch to Hebrew numerals'}
          title={useHebrewNumerals ? 'Show as Arabic numerals' : 'Show as Hebrew numerals'}
        >
          {useHebrewNumerals ? 'Arabic' : 'Hebrew'} numerals
        </button>
      )}
    </div>
  )
}
