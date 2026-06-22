'use client'

import Image, { type ImageProps } from 'next/image'
import { ImageIcon } from 'lucide-react'
import { useState } from 'react'

type SmartImageProps = ImageProps & {
  /** Classes for the fallback box; default covers a `fill` parent */
  fallbackClassName?: string
  /** Fallback icon size in px */
  iconSize?: number
}

/**
 * next/image wrapper: if the image is missing or fails to load,
 * renders a clean gray placeholder (bg-slate-100 + centered lucide ImageIcon).
 */
export default function SmartImage({
  fallbackClassName = 'absolute inset-0',
  iconSize = 32,
  alt,
  ...props
}: SmartImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    const a11y = alt
      ? ({ role: 'img', 'aria-label': alt } as const)
      : ({ 'aria-hidden': true } as const)
    return (
      <div
        {...a11y}
        className={`flex items-center justify-center bg-slate-100 ${fallbackClassName}`}
      >
        <ImageIcon aria-hidden="true" size={iconSize} className="text-slate-400" />
      </div>
    )
  }

  return <Image alt={alt} {...props} onError={() => setFailed(true)} />
}
