import { ImagePlus as LucideImagePlus } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ImagePlus = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideImagePlus ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ImagePlus.displayName = 'ImagePlus'
