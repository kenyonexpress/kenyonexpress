import { Receipt as LucideReceipt } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Receipt = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideReceipt ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Receipt.displayName = 'Receipt'
