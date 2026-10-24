import { MessageCircle } from 'lucide-react'

type Props = {
  size?: number
  className?: string
}

/** WhatsApp icon from lucide-react (MessageCircle used as WhatsApp representation). */
export default function WhatsAppIcon({ size = 24, className }: Props) {
  return <MessageCircle size={size} className={className} />
}
