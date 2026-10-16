import { Trash2 as LucideTrash2 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Trash2 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideTrash2 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Trash2.displayName = 'Trash2'
