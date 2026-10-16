'use client'

import { StickyCartBar } from '@/components/mobile'
import { useCallback, useState } from 'react'

interface ProductStickyCartBarProps {
  basePrice: number
  productId: string
}

export default function ProductStickyCartBar({
  basePrice,
  productId: _productId,
}: ProductStickyCartBarProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleAddToCart = useCallback(async () => {
    setIsLoading(true)
    try {
      // The actual add-to-cart logic will be handled by the parent component
      // This is just the UI trigger
      const addButton = document.querySelector('[data-pdp="buy-button"]') as HTMLButtonElement
      if (addButton) {
        addButton.click()
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  return <StickyCartBar price={basePrice} onAddToCart={handleAddToCart} isLoading={isLoading} />
}
