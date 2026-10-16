import { ShoppingCart as LucideShoppingCart } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ShoppingCart = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideShoppingCart ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ShoppingCart.displayName = 'ShoppingCart'
