import { Layers as LucideLayers } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Layers = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideLayers ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Layers.displayName = 'Layers'
