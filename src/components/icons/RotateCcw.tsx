import { RotateCcw as LucideRotateCcw } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const RotateCcw = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideRotateCcw ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
RotateCcw.displayName = 'RotateCcw'
