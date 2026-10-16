import { Store as LucideStore } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Store = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideStore ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Store.displayName = 'Store'
