import { LoaderCircle as LucideLoaderCircle } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const LoaderCircle = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideLoaderCircle ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
LoaderCircle.displayName = 'LoaderCircle'
