import { Play as LucidePlay } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Play = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucidePlay ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Play.displayName = 'Play'
