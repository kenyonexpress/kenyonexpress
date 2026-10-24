// Variant naming shared by the server (conversion, upload) and the client
// (R2Image). No node built-ins and no sharp: safe to import in a client bundle.

export const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920] as const
export const VARIANT_FORMATS = ['avif', 'webp'] as const

export type VariantFormat = (typeof VARIANT_FORMATS)[number]

/** `products/abc` + 640 + avif -> `products/abc/640.avif` */
export const variantKey = (baseKey: string, width: number, format: VariantFormat) =>
  `${baseKey.replace(/\/+$/, '')}/${width}.${format}`

/** Smallest variant at least `width` wide, else the largest we have. */
export function pickVariantWidth(
  width: number,
  widths: readonly number[] = VARIANT_WIDTHS,
): number {
  const sorted = [...widths].sort((a, b) => a - b)
  return sorted.find((w) => w >= width) ?? (sorted[sorted.length - 1] as number)
}

export function variantSrcSet(
  publicBase: string,
  baseKey: string,
  format: VariantFormat,
  widths: readonly number[] = VARIANT_WIDTHS,
): string {
  const base = publicBase.replace(/\/$/, '')
  return widths.map((w) => `${base}/${variantKey(baseKey, w, format)} ${w}w`).join(', ')
}
