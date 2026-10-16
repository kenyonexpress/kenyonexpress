import { Plus as LucidePlus } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Plus = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucidePlus ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Plus.displayName = 'Plus'
