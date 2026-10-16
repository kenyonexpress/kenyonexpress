import { FileSpreadsheet as LucideFileSpreadsheet } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const FileSpreadsheet = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideFileSpreadsheet ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
FileSpreadsheet.displayName = 'FileSpreadsheet'
