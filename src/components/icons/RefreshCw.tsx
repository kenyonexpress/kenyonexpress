import { RefreshCw as LucideRefreshCw } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const RefreshCw = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideRefreshCw ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
RefreshCw.displayName = 'RefreshCw'
