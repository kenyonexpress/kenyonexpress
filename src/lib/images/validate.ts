// Client-safe validation shared by the upload UI and the server pipeline.
// Must not import sharp (bundled into client components).

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]

export const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024

/**
 * Alt text gate: at least 3 characters and must contain Hebrew letters.
 * Every uploaded image must ship a Hebrew alt for accessibility + SEO.
 */
export function isValidHebrewAlt(alt: string | null | undefined): boolean {
  const trimmed = (alt ?? '').trim()
  return trimmed.length >= 3 && /[\u0590-\u05FF]/.test(trimmed)
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'סוג קובץ לא נתמך (מותר: JPG, PNG, WebP, GIF, AVIF)'
  }
  if (file.size > MAX_ORIGINAL_BYTES) return 'הקובץ גדול מדי (מקסימום 8MB)'
  return null
}

/** Product photos below this width pixelate in the 800px rendition slot. */
export const MIN_IMAGE_WIDTH = 800

/** Height/width must sit inside [0.5, 2]: banners and slivers break the card grid. */
export const MIN_ASPECT = 0.5
export const MAX_ASPECT = 2

/**
 * Dimension gate, called by the server pipeline AFTER sharp has decoded the
 * original (the client cannot be trusted to report dimensions). Null when
 * acceptable; a Hebrew reason otherwise.
 */
export function validateImageDimensions(width: number, height: number): string | null {
  if (width < MIN_IMAGE_WIDTH) {
    return `התמונה צרה מדי (${width}px) — נדרש רוחב של לפחות ${MIN_IMAGE_WIDTH}px`
  }
  if (height <= 0) return 'לתמונה אין גובה'
  const aspect = height / width
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) {
    return 'יחס הממדים חורג (מותר בין 1:2 ל-2:1) — חתוך את התמונה לפני ההעלאה'
  }
  return null
}
