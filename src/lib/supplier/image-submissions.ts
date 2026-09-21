/**
 * What a supplier may upload for approval, and where it goes at each stage.
 *
 * Two kinds: a product image (lands in `products.images` when approved) and
 * the shop logo (`suppliers.logo_url`). Both park in the private
 * `supplier-pending` bucket first (migration 232), which no client role can
 * read or write; the server does both halves with the service role.
 */
export type SubmissionKind = 'product' | 'logo'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export const PENDING_BUCKET = 'supplier-pending'

/** Where an approved object is copied to. Public buckets that already exist. */
export const PUBLISH_BUCKET: Record<SubmissionKind, 'product-images' | 'vendor-logos'> = {
  product: 'product-images',
  logo: 'vendor-logos',
}

export const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const
export const MAX_BYTES: Record<SubmissionKind, number> = {
  product: 5 * 1024 * 1024,
  logo: 2 * 1024 * 1024,
}
export const MAX_ALT_LENGTH = 200

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function isSubmissionKind(raw: unknown): raw is SubmissionKind {
  return raw === 'product' || raw === 'logo'
}

export type FileFacts = { type: string; size: number }

export type FileValidation = { ok: true; ext: string } | { ok: false; error: string }

/** Checks the facts the browser reports. The server re-reads the real bytes'
 *  dimensions through sharp when it publishes, so a lying MIME type costs a
 *  rejection there, never a broken image on the catalogue. */
export function validateSubmissionFile(file: FileFacts, kind: SubmissionKind): FileValidation {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'סוג קובץ לא נתמך. מותרים: JPG, PNG, WebP.' }
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: 'הקובץ ריק.' }
  }
  if (file.size > MAX_BYTES[kind]) {
    const mb = Math.round(MAX_BYTES[kind] / 1024 / 1024)
    return { ok: false, error: `הקובץ גדול מדי. מקסימום ${mb}MB.` }
  }
  return { ok: true, ext: EXT_BY_MIME[file.type] ?? 'jpg' }
}

export function validateAlt(
  raw: unknown,
): { ok: true; alt: string } | { ok: false; error: string } {
  const alt = String(raw ?? '').trim()
  if (alt.length === 0) return { ok: false, error: 'יש לתאר את התמונה במילים.' }
  if (alt.length > MAX_ALT_LENGTH) {
    return { ok: false, error: `התיאור ארוך מדי (עד ${MAX_ALT_LENGTH} תווים).` }
  }
  return { ok: true, alt }
}

/**
 * The object key inside the pending bucket. Supplier-scoped by prefix so a
 * listing for one shop can never show another's, and random so a name the
 * supplier chose cannot collide with, or overwrite, an earlier upload.
 */
export function pendingObjectPath(
  supplierId: string,
  kind: SubmissionKind,
  ext: string,
  random: string = crypto.randomUUID(),
): string {
  return `${supplierId}/${kind}/${random}.${ext}`
}

/** The public key an approved object is copied to. */
export function publishedObjectPath(
  kind: SubmissionKind,
  ownerId: string,
  submissionId: string,
  ext: string,
): string {
  return kind === 'logo'
    ? `logos/${ownerId}/${submissionId}.${ext}`
    : `${ownerId}/${submissionId}.${ext}`
}
