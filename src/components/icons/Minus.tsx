import { Minus as LucideMinus } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Minus = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMinus ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Minus.displayName = 'Minus'
