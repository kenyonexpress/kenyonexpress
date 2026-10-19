import { FaWhatsapp } from '@/components/icons/electro-icons'

type Props = {
  size?: number
  className?: string
}

/** WhatsApp glyph: Font Awesome as shipped by Electro v7 (fa-whatsapp). */
export default function WhatsAppIcon({ size = 24, className }: Props) {
  return <FaWhatsapp size={size} className={className} />
}
