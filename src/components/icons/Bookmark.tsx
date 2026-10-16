import { Bookmark as LucideBookmark } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Bookmark = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideBookmark ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Bookmark.displayName = 'Bookmark'
