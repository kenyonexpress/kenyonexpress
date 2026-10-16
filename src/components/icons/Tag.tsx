import { Tag as LucideTag } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Tag = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideTag ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Tag.displayName = 'Tag'
