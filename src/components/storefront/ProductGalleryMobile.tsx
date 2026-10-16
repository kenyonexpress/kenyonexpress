'use client'

import { SwipeableGallery } from '@/components/mobile'

interface ProductGalleryMobileProps {
  images: string[]
  name: string
}

export default function ProductGalleryMobile({ images, name }: ProductGalleryMobileProps) {
  return (
    <div className="md:hidden">
      <SwipeableGallery images={images} alt={name} />
    </div>
  )
}
