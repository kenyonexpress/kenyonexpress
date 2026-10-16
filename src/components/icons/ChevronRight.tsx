import { ChevronRight as LucideChevronRight } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ChevronRight = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideChevronRight ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ChevronRight.displayName = 'ChevronRight'
