import { ShieldAlert as LucideShieldAlert } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ShieldAlert = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideShieldAlert ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ShieldAlert.displayName = 'ShieldAlert'
