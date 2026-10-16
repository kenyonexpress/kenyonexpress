import { Settings as LucideSettings } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Settings = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideSettings ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Settings.displayName = 'Settings'
