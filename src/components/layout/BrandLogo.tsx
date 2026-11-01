import { LOGO, LOGO_LIGHT, LOGO_PNG } from '@/lib/assets'
import { BRAND_DISPLAY_NAME } from '@/lib/brand'

/**
 * The project logo as an SVG with a 1x/2x/3x PNG fallback (C137). Plain
 * <picture>, no optimizer: the SVG is resolution-free and the PNGs are already
 * the exact densities.
 */
export default function BrandLogo({
  tone = 'dark',
  className,
}: {
  tone?: 'dark' | 'light'
  className?: string
}) {
  const [x1, x2, x3] = LOGO_PNG[tone]
  return (
    <picture>
      <source type="image/svg+xml" srcSet={tone === 'light' ? LOGO_LIGHT : LOGO} />
      <img
        src={x1}
        srcSet={`${x1} 1x, ${x2} 2x, ${x3} 3x`}
        alt={BRAND_DISPLAY_NAME}
        width={190}
        height={50}
        loading="lazy"
        decoding="async"
        className={className}
      />
    </picture>
  )
}
