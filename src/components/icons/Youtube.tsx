import { Play as LucidePlay } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Youtube = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucidePlay ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Youtube.displayName = 'Youtube'
