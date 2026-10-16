import { Banknote as LucideBanknote } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Banknote = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideBanknote ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Banknote.displayName = 'Banknote'
