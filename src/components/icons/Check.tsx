import { Check as LucideCheck } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Check = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCheck ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Check.displayName = 'Check'
