import { AtSign as LucideAtSign } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const AtSign = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideAtSign ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
AtSign.displayName = 'AtSign'
