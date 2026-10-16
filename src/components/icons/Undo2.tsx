import { Undo2 as LucideUndo2 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Undo2 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideUndo2 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Undo2.displayName = 'Undo2'
