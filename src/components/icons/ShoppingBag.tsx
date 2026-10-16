import { ShoppingBag as LucideShoppingBag } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ShoppingBag = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideShoppingBag ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ShoppingBag.displayName = 'ShoppingBag'
