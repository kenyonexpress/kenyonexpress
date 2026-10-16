import { Copy as LucideCopy } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Copy = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCopy ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Copy.displayName = 'Copy'
