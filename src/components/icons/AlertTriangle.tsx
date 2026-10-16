import { AlertTriangle as LucideAlertTriangle } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const AlertTriangle = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideAlertTriangle ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
AlertTriangle.displayName = 'AlertTriangle'
