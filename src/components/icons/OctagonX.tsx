import { OctagonX as LucideOctagonX } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const OctagonX = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideOctagonX ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
OctagonX.displayName = 'OctagonX'
