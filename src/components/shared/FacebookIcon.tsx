type Props = {
  size?: number
  className?: string
}

/**
 * Facebook brand glyph.
 *
 * Inline for the same reason `WhatsAppIcon` is: lucide carries no brand icons.
 * `lucide-react@1` has no `Facebook` export at all — brand marks are
 * trademarks and were dropped upstream — and importing one type-checks as an
 * error rather than failing at runtime, which is the good direction.
 */
export default function FacebookIcon({ size = 24, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 3.925 23.094 9.056 24v-8.437H6.33v-3.49h2.726V9.695c0-2.708 1.6-4.204 4.043-4.204 1.171 0 2.395.21 2.395.21v2.656h-1.35c-1.33 0-1.744.831-1.744 1.684v2.032h2.968l-.474 3.49h-2.494V24C20.075 23.094 24 18.1 24 12.073z" />
    </svg>
  )
}
