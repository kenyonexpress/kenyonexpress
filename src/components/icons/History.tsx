import { History as LucideHistory } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const History = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideHistory ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
History.displayName = 'History'
