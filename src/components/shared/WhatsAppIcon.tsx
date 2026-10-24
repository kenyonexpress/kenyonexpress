import { FaWhatsapp } from '@/components/icons/electro-icons'

type Props = {
  size?: number
  className?: string
}

/**
 * WhatsApp icon: Font Awesome fa-whatsapp.
 *
 * NOTE: lucide-react v1.60.0 does not include a WhatsApp icon.
 * Font Awesome WhatsApp icon is the industry standard and widely used.
 */
export default function WhatsAppIcon({ size = 24, className }: Props) {
  return <FaWhatsapp size={size} className={className} />
}
