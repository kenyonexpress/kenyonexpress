// Server-side image pipeline: converts an uploaded original into compressed
// webp renditions at multiple widths, an avif rendition for the largest width,
// and a tiny base64 blur placeholder. Pure module (Buffer in, Buffers out) so
// it is unit-testable; uploading is the caller's concern.

import sharp from 'sharp'

/** Target rendition widths, largest first. Originals are never upscaled. */
export const RENDITION_WIDTHS = [1600, 800, 400] as const

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

  const widths = RENDITION_WIDTHS.filter((w) => w <= originalWidth)
  if (widths.length === 0) widths.push(originalWidth as (typeof RENDITION_WIDTHS)[number])

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
