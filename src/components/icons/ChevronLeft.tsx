import { ChevronLeft as LucideChevronLeft } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ChevronLeft = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideChevronLeft ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ChevronLeft.displayName = 'ChevronLeft'
