import { Bell as LucideBell } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Bell = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideBell ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Bell.displayName = 'Bell'
