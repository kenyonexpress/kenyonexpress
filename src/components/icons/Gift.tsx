import { Gift as LucideGift } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Gift = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideGift ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Gift.displayName = 'Gift'
