import { ArrowLeft as LucideArrowLeft } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ArrowLeft = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideArrowLeft ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ArrowLeft.displayName = 'ArrowLeft'
