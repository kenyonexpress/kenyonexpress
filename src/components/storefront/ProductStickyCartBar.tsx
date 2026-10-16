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
