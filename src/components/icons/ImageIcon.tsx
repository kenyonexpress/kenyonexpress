import { Image as LucideImage } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ImageIcon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideImage ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ImageIcon.displayName = 'ImageIcon'
