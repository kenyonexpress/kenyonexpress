'use client'

import StickyCartBar from '@/components/mobile/StickyCartBar'
import { agorotFromIlsNumber } from '@/lib/money'
import { useCallback, useState } from 'react'

interface ProductStickyCartBarProps {
  /** Shekels, as the product page reads `kenyon_price`. */
  basePrice: number
  productId: string
}

export default function ProductStickyCartBar({ basePrice }: ProductStickyCartBarProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleAddToCart = useCallback(async () => {
    setIsLoading(true)
    try {
      // Find the add-to-cart button by searching for either button text variant
      const buttons = Array.from(document.querySelectorAll('button'))
      const addButton = buttons.find((btn) => {
        const text = btn.textContent || ''
        return text.includes('הוסף לסל') || text.includes('הוסף לעגלה')
      })
      if (addButton) {
        addButton.click()
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // StickyCartBar takes agorot. Passing the shekel figure straight through
  // showed a 99 ₪ product as 0.99 ₪ in the mobile bar (C145).
  return (
    <StickyCartBar
      price={agorotFromIlsNumber(basePrice)}
      onAddToCart={handleAddToCart}
      isLoading={isLoading}
    />
  )
}
