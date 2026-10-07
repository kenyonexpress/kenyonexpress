// One image in, one smaller image out: compressed, EXIF-free, optionally
// watermarked. Plain ESM on purpose, so the same bytes-level rules run inside
// the app (src/lib/images/process.ts, the admin upload path) and inside the
// promotion script (scripts/r2-promote/run.mjs --optimize) without a TypeScript
// loader in the way. tsconfig has allowJs, so the JSDoc here is the type.
//
// WHAT "STRIP EXIF" MEANS HERE, PRECISELY. sharp writes no EXIF, XMP or IPTC
// unless asked (`keepMetadata` / `withMetadata`), and nothing here asks. The
// orientation tag is BAKED before it is dropped: `.rotate()` with no argument
// applies the EXIF orientation to the pixels, so a phone photo that only
// looked upright because of its tag stays upright once the tag is gone. The
// ICC profile is kept (`keepIccProfile`): it carries no location, device or
// timestamp, and dropping it shifts the colours of a Display-P3 photo on every
// wide-gamut screen. The test next to this file reads the output back and
// asserts `exif` is absent and the dimensions of a rotated input are swapped.
//
// WATERMARK. Optional, off unless a `watermark` is passed. The mark is a
// PNG/SVG buffer, scaled to a fraction of the output width (never enlarged),
// given its opacity by multiplying its alpha channel (`dest-in` against a
// one-pixel tile), and composited at a corner with a margin. The composite
// runs after the resize in sharp's pipeline, so positions are in output
// pixels, which is what makes the same mark land in the same place on a 400
// and a 1600 rendition.
//
// FORMAT. `keep` re-encodes in the input's own family so a key such as
// `products/b7.avif` keeps its extension and the catalogue row pointing at it
// stays valid; an explicit `webp` / `avif` / `jpeg` / `png` converts. GIF
// is passed through untouched: re-encoding drops the animation and there is
// no size to win on a 600px product GIF worth that.

import sharp from 'sharp'

/** Quality per output format, the values the upload pipeline already ships with. */
export const OPTIMIZE_QUALITY = Object.freeze({ webp: 80, avif: 55, jpeg: 82, png: 9 })

/** The default ceiling on the long edge; nothing is ever enlarged to it. */
export const DEFAULT_MAX_WIDTH = 1600

/** @typedef {'keep' | 'webp' | 'avif' | 'jpeg' | 'png'} OutputFormat */

/**
 * @typedef {object} WatermarkSpec
 * @property {Buffer} image      PNG or SVG bytes of the mark
 * @property {number} [opacity]  0..1, default 0.35
 * @property {number} [scale]    fraction of the output width, default 0.18
 * @property {number} [margin]   output pixels from the corner, default 16
 * @property {'southeast' | 'southwest' | 'northeast' | 'northwest' | 'centre'} [gravity]
 */

/**
 * @typedef {object} OptimizeOptions
 * @property {number} [maxWidth]        default DEFAULT_MAX_WIDTH
 * @property {OutputFormat} [format]    default 'keep'
 * @property {WatermarkSpec | null} [watermark]
 */

/**
 * @typedef {object} OptimizedImage
 * @property {Buffer} buffer
 * @property {string} format      sharp's output format name ('jpeg', 'webp', ...)
 * @property {string} extension   the extension that matches `format`
 * @property {number} width
 * @property {number} height
 * @property {number} bytesIn
 * @property {number} bytesOut
 * @property {boolean} watermarked
 */

const EXTENSION = Object.freeze({ jpeg: 'jpg', webp: 'webp', avif: 'avif', png: 'png', gif: 'gif' })

/** @param {string} format */
export function extensionForFormat(format) {
  return EXTENSION[/** @type {keyof typeof EXTENSION} */ (format)] ?? format
}

/**
 * The input family that `keep` re-encodes into. heif covers avif in sharp's
 * metadata; svg and anything unknown become webp, because an SVG is a
 * document and not a photo and the proxy refuses to serve it anyway.
 * @param {string | undefined} inputFormat
 * @returns {'webp' | 'avif' | 'jpeg' | 'png' | 'gif'}
 */
export function outputFamilyFor(inputFormat) {
  switch (inputFormat) {
    case 'jpeg':
    case 'jpg':
      return 'jpeg'
    case 'png':
      return 'png'
    case 'avif':
    case 'heif':
      return 'avif'
    case 'gif':
      return 'gif'
    default:
      return 'webp'
  }
}

/**
 * The mark, resized to the output and with its alpha multiplied by `opacity`.
 * Returned as PNG so the composite keeps the transparency.
 * @param {WatermarkSpec} spec
 * @param {number} outputWidth
 * @returns {Promise<{ input: Buffer, width: number, height: number }>}
 */
export async function prepareWatermark(spec, outputWidth) {
  const opacity = clamp(spec.opacity ?? 0.35, 0, 1)
  const scale = clamp(spec.scale ?? 0.18, 0.02, 1)
  const targetWidth = Math.max(1, Math.round(outputWidth * scale))
  const alpha = Math.round(opacity * 255)
  const { data, info } = await sharp(spec.image)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([255, 255, 255, alpha]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer({ resolveWithObject: true })
  return { input: data, width: info.width, height: info.height }
}

/**
 * Where the mark goes, in output pixels, clamped so a mark larger than the
 * margin allows still lands inside the frame.
 * @param {{ width: number, height: number }} output
 * @param {{ width: number, height: number }} mark
 * @param {NonNullable<WatermarkSpec['gravity']>} gravity
 * @param {number} margin
 */
export function watermarkPosition(output, mark, gravity, margin) {
  const maxLeft = Math.max(0, output.width - mark.width)
  const maxTop = Math.max(0, output.height - mark.height)
  const m = Math.max(0, margin)
  const left = (() => {
    if (gravity === 'centre') return Math.round(maxLeft / 2)
    return gravity.endsWith('east') ? Math.max(0, maxLeft - m) : Math.min(maxLeft, m)
  })()
  const top = (() => {
    if (gravity === 'centre') return Math.round(maxTop / 2)
    return gravity.startsWith('south') ? Math.max(0, maxTop - m) : Math.min(maxTop, m)
  })()
  return { left, top }
}

/**
 * Output dimensions after the width cap, from the ORIENTED size.
 * @param {{ width: number, height: number }} oriented
 * @param {number} maxWidth
 */
export function fittedSize(oriented, maxWidth) {
  if (oriented.width <= maxWidth) return { width: oriented.width, height: oriented.height }
  const height = Math.max(1, Math.round((oriented.height * maxWidth) / oriented.width))
  return { width: maxWidth, height }
}

/**
 * sharp reports `width`/`height` as stored; orientation 5..8 means the
 * displayed image is the transpose. `.rotate()` applies that, so the output
 * dimensions are the swapped ones.
 * @param {import('sharp').Metadata} meta
 */
export function orientedSize(meta) {
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const transposed = (meta.orientation ?? 1) >= 5
  return transposed ? { width: height, height: width } : { width, height }
}

/**
 * Apply the optional mark to a pipeline whose output size is known.
 * @param {import('sharp').Sharp} pipeline
 * @param {WatermarkSpec | null | undefined} watermark
 * @param {{ width: number, height: number }} output
 */
export async function applyWatermark(pipeline, watermark, output) {
  if (!watermark) return false
  const mark = await prepareWatermark(watermark, output.width)
  const { left, top } = watermarkPosition(
    output,
    mark,
    watermark.gravity ?? 'southeast',
    watermark.margin ?? 16,
  )
  pipeline.composite([{ input: mark.input, left, top }])
  return true
}

/**
 * Encode in `format`, or in the input's family for 'keep'.
 * @param {import('sharp').Sharp} pipeline
 * @param {OutputFormat} format
 * @param {string | undefined} inputFormat
 */
export function encode(pipeline, format, inputFormat) {
  const target = format === 'keep' ? outputFamilyFor(inputFormat) : format
  switch (target) {
    case 'jpeg':
      return pipeline.jpeg({ quality: OPTIMIZE_QUALITY.jpeg, mozjpeg: true })
    case 'png':
      return pipeline.png({ compressionLevel: OPTIMIZE_QUALITY.png, effort: 7 })
    case 'avif':
      return pipeline.avif({ quality: OPTIMIZE_QUALITY.avif, effort: 4 })
    case 'gif':
      return pipeline.gif()
    default:
      return pipeline.webp({ quality: OPTIMIZE_QUALITY.webp, effort: 4 })
  }
}

/**
 * @param {Buffer} input
 * @param {OptimizeOptions} [options]
 * @returns {Promise<OptimizedImage>}
 */
export async function optimizeImage(input, options = {}) {
  const maxWidth = Math.max(1, Math.floor(options.maxWidth ?? DEFAULT_MAX_WIDTH))
  const format = options.format ?? 'keep'

  const meta = await sharp(input).metadata()
  if (!meta.width || !meta.height) throw new Error('failed to read image dimensions')

  // Animated GIF: untouched. See the header.
  if (meta.format === 'gif' && (meta.pages ?? 1) > 1 && format === 'keep') {
    return {
      buffer: input,
      format: 'gif',
      extension: 'gif',
      width: meta.width,
      height: meta.height,
      bytesIn: input.length,
      bytesOut: input.length,
      watermarked: false,
    }
  }

  const output = fittedSize(orientedSize(meta), maxWidth)
  const pipeline = sharp(input)
    .rotate()
    .resize({ width: output.width, withoutEnlargement: true })
    .keepIccProfile()

  const watermarked = await applyWatermark(pipeline, options.watermark, output)

  const { data, info } = await encode(pipeline, format, meta.format).toBuffer({
    resolveWithObject: true,
  })

  return {
    buffer: data,
    format: info.format,
    extension: extensionForFormat(info.format),
    width: info.width,
    height: info.height,
    bytesIn: input.length,
    bytesOut: data.length,
    watermarked,
  }
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))
}
