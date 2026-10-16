import { Zap as LucideZap } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Zap = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideZap ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Zap.displayName = 'Zap'
