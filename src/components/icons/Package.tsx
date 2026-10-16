import { Package as LucidePackage } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Package = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucidePackage ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Package.displayName = 'Package'
