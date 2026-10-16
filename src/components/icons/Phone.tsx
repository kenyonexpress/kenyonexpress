import { Phone as LucidePhone } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Phone = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucidePhone ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Phone.displayName = 'Phone'
