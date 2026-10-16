import { Info as LucideInfo } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Info = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideInfo ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Info.displayName = 'Info'
