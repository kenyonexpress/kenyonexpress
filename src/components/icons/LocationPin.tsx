import type { SVGProps } from 'react'

type Props = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'> & { size?: number | string }

/**
 * Map pin in the design system's rounded-tile style: a soft rounded square
 * behind a stroked pin. Decorative only; the city text beside it carries the
 * meaning, so it is aria-hidden.
 */
export default function LocationPin({ size = 16, className, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={['location-pin', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <rect className="location-pin__tile" x="0" y="0" width="16" height="16" rx="5" />
      <path
        className="location-pin__glyph"
        d="M8 3.25a3.25 3.25 0 0 0-3.25 3.25c0 2.4 3.25 6.25 3.25 6.25s3.25-3.85 3.25-6.25A3.25 3.25 0 0 0 8 3.25Z"
        fill="none"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle className="location-pin__dot" cx="8" cy="6.5" r="1.1" />
    </svg>
  )
}
