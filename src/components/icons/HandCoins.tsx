import { HandCoins as LucideHandCoins } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const HandCoins = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideHandCoins ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
HandCoins.displayName = 'HandCoins'
