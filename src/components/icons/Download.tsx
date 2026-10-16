import { Download as LucideDownload } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Download = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideDownload ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Download.displayName = 'Download'
