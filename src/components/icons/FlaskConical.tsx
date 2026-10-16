import { FlaskConical as LucideFlaskConical } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const FlaskConical = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideFlaskConical ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
FlaskConical.displayName = 'FlaskConical'
