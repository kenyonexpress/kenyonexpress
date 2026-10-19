import { FaFacebook } from '@/components/icons/electro-icons'

type Props = {
  size?: number
  className?: string
}

/** Facebook glyph: Font Awesome as shipped by Electro v7 (fa-facebook). */
export default function FacebookIcon({ size = 24, className }: Props) {
  return <FaFacebook size={size} className={className} />
}
