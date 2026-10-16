import { Rss as LucideRss } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Rss = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideRss ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Rss.displayName = 'Rss'
