import { Coins as LucideCoins } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Coins = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCoins ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Coins.displayName = 'Coins'
