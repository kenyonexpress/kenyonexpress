import { Mail as LucideMail } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Mail = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMail ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Mail.displayName = 'Mail'
