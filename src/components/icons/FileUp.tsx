import { FileUp as LucideFileUp } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const FileUp = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideFileUp ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
FileUp.displayName = 'FileUp'
