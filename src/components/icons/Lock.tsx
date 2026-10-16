import { Lock as LucideLock } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Lock = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideLock ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Lock.displayName = 'Lock'
