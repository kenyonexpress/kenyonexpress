import { BookmarkCheck as LucideBookmarkCheck } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const BookmarkCheck = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideBookmarkCheck ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
BookmarkCheck.displayName = 'BookmarkCheck'
