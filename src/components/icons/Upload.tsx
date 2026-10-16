import { Upload as LucideUpload } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Upload = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideUpload ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Upload.displayName = 'Upload'
