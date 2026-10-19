'use client'

import { StickyCartBar } from '@/components/mobile'
import { useCallback, useState } from 'react'

interface ProductStickyCartBarProps {
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

  return <StickyCartBar price={basePrice} onAddToCart={handleAddToCart} isLoading={isLoading} />
}
