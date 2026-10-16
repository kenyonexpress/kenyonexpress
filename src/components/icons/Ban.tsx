import { Ban as LucideBan } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Ban = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideBan ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Ban.displayName = 'Ban'
