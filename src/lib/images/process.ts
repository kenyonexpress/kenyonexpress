// Server-side image pipeline: converts an uploaded original into compressed
// webp renditions at multiple widths, an avif rendition for the largest width,
// and a tiny base64 blur placeholder. Pure module (Buffer in, Buffers out) so
// it is unit-testable; uploading is the caller's concern.

import sharp from 'sharp'

/** Target rendition widths, largest first. Originals are never upscaled. */
export const RENDITION_WIDTHS = [1600, 800, 400] as const

/**
 * The widths actually produced for an original of this width.
 *
 * WHY THIS IS NOT `RENDITION_WIDTHS.filter(w => w <= original)`
 *
 * That was the rule, and it discards pixels the admin uploaded. A 1200px
 * original fails `1600 <= 1200`, so the LARGEST rendition it produced was 800:
 * measured, a 1200x900 upload was stored at 800x600 and nothing said so. The
 * product gallery then serves 800px to a phone asking for 1170 (390 CSS px at
 * DPR 3) and the browser upscales it.
 *
 * The intent was "never upscale", not "round down to the next tier". The cap
 * is the ceiling, so the top rendition is `min(original, 1600)` and the tiers
 * below it are kept as they were. A tier that equals the original is not
 * emitted twice.
 */
export function renditionWidthsFor(originalWidth: number): number[] {
  const top = Math.min(originalWidth, RENDITION_WIDTHS[0])
  const widths = [top, ...RENDITION_WIDTHS.filter((w) => w < top)]
  return [...new Set(widths)]
}

const WEBP_QUALITY = 80
const AVIF_QUALITY = 55
const BLUR_WIDTH = 16

export type Rendition = {
  format: 'webp' | 'avif'
  width: number
  height: number
  buffer: Buffer
}

export type ProcessedImage = {
  /** Intrinsic size of the largest produced rendition. */
  width: number
  height: number
  blurDataURL: string
  /** Largest webp first; exactly one avif (for the largest width). */
  renditions: Rendition[]
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  // .rotate() applies EXIF orientation so width/height are the visual ones.
  const base = sharp(input).rotate()
  const meta = await base.metadata()
  const originalWidth = meta.width ?? 0
  if (!originalWidth) throw new Error('failed to read image dimensions')

  const widths = renditionWidthsFor(originalWidth)

  const renditions: Rendition[] = []
  for (const width of widths) {
    const { data, info } = await base
      .clone()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    renditions.push({ format: 'webp', width: info.width, height: info.height, buffer: data })
  }

  // avif only for the largest width: the encode is expensive and smaller
  // widths are already tiny as webp.
  const largest = renditions[0]
  if (!largest) throw new Error('no renditions produced')
  const avif = await base
    .clone()
    .resize({ width: largest.width, withoutEnlargement: true })
    .avif({ quality: AVIF_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true })
  renditions.push({
    format: 'avif',
    width: avif.info.width,
    height: avif.info.height,
    buffer: avif.data,
  })

  const blur = await base.clone().resize({ width: BLUR_WIDTH }).webp({ quality: 40 }).toBuffer()

  return {
    width: largest.width,
    height: largest.height,
    blurDataURL: `data:image/webp;base64,${blur.toString('base64')}`,
    renditions,
  }
}
