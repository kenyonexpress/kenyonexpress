import { QrCode as LucideQrCode } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const QrCode = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideQrCode ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
QrCode.displayName = 'QrCode'
