import { Edit2 as LucideEdit2 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Edit2 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideEdit2 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Edit2.displayName = 'Edit2'
