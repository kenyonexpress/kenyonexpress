import { CreditCard as LucideCreditCard } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const CreditCard = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCreditCard ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
CreditCard.displayName = 'CreditCard'
