import { X as LucideX } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const X = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideX ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
X.displayName = 'X'
