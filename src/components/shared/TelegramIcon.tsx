type Props = {
  size?: number
  className?: string
}

/** Telegram brand glyph (lucide carries no brand icons, same as WhatsApp/Facebook). */
export default function TelegramIcon({ size = 24, className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21.94 4.6c.27-1.15-.42-1.6-1.17-1.33L2.4 10.55c-1.1.43-1.1 1.05-.2 1.32l4.5 1.4 1.74 5.3c.2.6.34.84.7.84.28 0 .4-.13.57-.3l1.62-1.55 3.36 2.47c.62.34 1.06.16 1.22-.57l2.2-14.34.03-.12zM8.24 13.02l9.6-6.06c.45-.27.87-.13.53.17l-8.13 7.33-.32 3.44-1.68-4.88z" />
    </svg>
  )
}
