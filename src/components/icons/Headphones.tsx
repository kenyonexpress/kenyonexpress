import { Headphones as LucideHeadphones } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Headphones = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideHeadphones ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Headphones.displayName = 'Headphones'
