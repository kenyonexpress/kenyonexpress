import { Home as LucideHome } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Home = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideHome ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Home.displayName = 'Home'
