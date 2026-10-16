import { CalendarX as LucideCalendarX } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const CalendarX = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCalendarX ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
CalendarX.displayName = 'CalendarX'
