import { Scale as LucideScale } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Scale = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideScale ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Scale.displayName = 'Scale'
