import { WifiOff as LucideWifiOff } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const WifiOff = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideWifiOff ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
WifiOff.displayName = 'WifiOff'
