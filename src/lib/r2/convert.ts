// Upload -> AVIF + WebP variants. Server only (sharp).

import 'server-only'
import sharp from 'sharp'
import { VARIANT_WIDTHS, type VariantFormat, variantKey } from './variants'

export type ConvertedVariant = {
  key: string
  width: number
  format: VariantFormat
  contentType: string
  body: Buffer
}

const QUALITY: Record<VariantFormat, number> = { avif: 55, webp: 78 }

/**
 * Re-encode `input` into every width x format. Never upscales: widths wider than
 * the source collapse into one variant at the source width. EXIF orientation is
 * applied, then metadata (GPS included) is dropped.
 */
export async function convertToVariants(
  input: Buffer,
  baseKey: string,
  widths: readonly number[] = VARIANT_WIDTHS,
): Promise<ConvertedVariant[]> {
  const meta = await sharp(input).metadata()
  const sourceWidth = meta.width
  if (!sourceWidth) throw new Error('unreadable image')

  const targets = [...new Set(widths.map((w) => Math.min(w, sourceWidth)))]
  const out: ConvertedVariant[] = []
  for (const width of targets) {
    const resized = sharp(input).rotate().resize({ width, withoutEnlargement: true })
    out.push(
      {
        key: variantKey(baseKey, width, 'avif'),
        width,
        format: 'avif',
        contentType: 'image/avif',
        body: await resized.clone().avif({ quality: QUALITY.avif }).toBuffer(),
      },
      {
        key: variantKey(baseKey, width, 'webp'),
        width,
        format: 'webp',
        contentType: 'image/webp',
        body: await resized.clone().webp({ quality: QUALITY.webp }).toBuffer(),
      },
    )
  }
  return out
}
