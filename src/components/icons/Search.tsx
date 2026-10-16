import { Search as LucideSearch } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Search = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideSearch ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Search.displayName = 'Search'
