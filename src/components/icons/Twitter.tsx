import { Send as LucideSend } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Twitter = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideSend ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Twitter.displayName = 'Twitter'
