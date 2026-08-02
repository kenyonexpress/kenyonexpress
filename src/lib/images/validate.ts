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
