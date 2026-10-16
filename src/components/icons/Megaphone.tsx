import { Megaphone as LucideMegaphone } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Megaphone = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMegaphone ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Megaphone.displayName = 'Megaphone'
