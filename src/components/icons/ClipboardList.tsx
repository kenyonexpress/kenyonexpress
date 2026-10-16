import { ClipboardList as LucideClipboardList } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ClipboardList = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideClipboardList ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ClipboardList.displayName = 'ClipboardList'
