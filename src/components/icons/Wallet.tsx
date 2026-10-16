import { Wallet as LucideWallet } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Wallet = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideWallet ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Wallet.displayName = 'Wallet'
