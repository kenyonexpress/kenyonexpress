import { TriangleAlert as LucideTriangleAlert } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const TriangleAlert = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideTriangleAlert ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
TriangleAlert.displayName = 'TriangleAlert'
