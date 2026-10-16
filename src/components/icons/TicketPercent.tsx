import { Ticket as LucideTicket } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const TicketPercent = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideTicket ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
TicketPercent.displayName = 'TicketPercent'
