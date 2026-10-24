import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { cn } from '@/lib/utils'

interface WhatsAppButtonProps {
  href: string
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}

/**
 * WhatsApp action button with brand color and 44px minimum touch target.
 *
 * Uses WhatsApp official green (#25D366) and ensures accessibility via
 * adequate touch target size per WCAG 2.1 AA (44x44px minimum).
 */
export default function WhatsAppButton({
  href,
  children,
  className,
  size = 'md',
}: WhatsAppButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all',
        'bg-whatsapp text-white hover:brightness-110',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-whatsapp',
        size === 'md' && 'min-h-touch-min px-4 py-2.5 text-base',
        size === 'sm' && 'min-h-touch-min px-3 py-2 text-sm',
        className,
      )}
    >
      <WhatsAppIcon size={size === 'md' ? 20 : 16} />
      {children}
    </a>
  )
}
