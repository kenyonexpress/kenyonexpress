import { ChevronDown as LucideChevronDown } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ChevronDown = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideChevronDown ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ChevronDown.displayName = 'ChevronDown'
