// Client-side pre-upload resize + compression. Runs in the browser before the
// file is handed to the server pipeline (processAndUploadImage), so a 20MB
// phone photo travels as a ~300KB webp instead of the original bytes.
//
// This is a transport optimization only: sharp on the server remains the
// authority for renditions, blur placeholder and final quality. Every failure
// path here therefore degrades to "send the original" rather than blocking the
// upload - the server will still accept anything under MAX_ORIGINAL_BYTES.

import { MAX_ORIGINAL_BYTES } from './validate'

/** Matches RENDITION_WIDTHS[0] in process.ts: pixels beyond this are discarded server-side anyway. */
export const CLIENT_MAX_DIMENSION = 1600

/** webp quality for the transport encode. Kept high: sharp re-encodes at 80 afterwards. */
export const CLIENT_COMPRESS_QUALITY = 0.85

/** Below this size the encode costs more than the bytes it saves. */
export const COMPRESS_THRESHOLD_BYTES = 300 * 1024

/**
 * Types that can be safely re-encoded through a canvas. gif is excluded
 * (animation would be flattened to one frame) and avif originals are already
 * small; both go up as-is.
 */
export const COMPRESSIBLE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * Compressible originals may exceed the server's 8MB cap because they shrink
 * before transport; non-compressible types must fit the server cap up front.
 */
export const MAX_COMPRESSIBLE_ORIGINAL_BYTES = 25 * 1024 * 1024

export function shouldClientCompress(file: File): boolean {
  return COMPRESSIBLE_TYPES.includes(file.type) && file.size > COMPRESS_THRESHOLD_BYTES
}

/** Contain-fit within maxDim x maxDim, never upscaling, preserving aspect ratio. */
export function targetDimensions(
  width: number,
  height: number,
  maxDim: number = CLIENT_MAX_DIMENSION,
): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height }
  const scale = maxDim / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Staging-time validation for the upload UI. Unlike validateImageFile, this
 * admits compressible originals up to 25MB because compressImageFile will
 * shrink them below the server's 8MB cap before anything is sent.
 */
export function validateStagedFile(file: File): string | null {
  if (COMPRESSIBLE_TYPES.includes(file.type)) {
    if (file.size > MAX_COMPRESSIBLE_ORIGINAL_BYTES) {
      return 'הקובץ גדול מדי (מקסימום 25MB לתמונה)'
    }
    return null
  }
  if (file.type === 'image/gif' || file.type === 'image/avif') {
    if (file.size > MAX_ORIGINAL_BYTES) return 'הקובץ גדול מדי (מקסימום 8MB לקובץ מסוג זה)'
    return null
  }
  return 'סוג קובץ לא נתמך (מותר: JPG, PNG, WebP, GIF, AVIF)'
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Downscale to CLIENT_MAX_DIMENSION and re-encode as webp. Returns the
 * original File whenever compression is impossible (SSR, old browser, decode
 * failure) or unprofitable (the encode came out larger than the source).
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!shouldClientCompress(file)) return file
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const { width, height } = targetDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await canvasToBlob(canvas, 'image/webp', CLIENT_COMPRESS_QUALITY)
    // Some browsers ignore the requested type and hand back png; only accept a
    // real webp that actually saved bytes.
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[a-z0-9]+$/i, '')
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' })
  } finally {
    bitmap.close()
  }
}
