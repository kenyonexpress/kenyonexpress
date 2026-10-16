import { PanelTop as LucidePanelTop } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const PanelTop = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucidePanelTop ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
PanelTop.displayName = 'PanelTop'
