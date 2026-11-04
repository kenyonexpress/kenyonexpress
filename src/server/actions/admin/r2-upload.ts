'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireStaffSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { processImage } from '@/lib/images/process'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_ORIGINAL_BYTES,
  isValidHebrewAlt,
  validateImageDimensions,
} from '@/lib/images/validate'
import { withActionContext } from '@/lib/observability/action-context'
import { rateLimit } from '@/lib/rate-limit'
import {
  type R2ImageVariant,
  isR2Configured,
  r2BucketFromEnv,
  uploadImageVariants,
} from '@/lib/storage/r2'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateTag } from 'next/cache'

export type R2UploadResult =
  | {
      /** Largest webp: what products.images stores. */
      url: string
      /** Largest avif. */
      avifUrl: string
      altHe: string
      blurDataURL: string
      width: number
      height: number
      variants: R2ImageVariant[]
    }
  | { error: string }

/**
 * Admin image upload straight to R2 (FormData: file, alt_he, folder).
 *
 * Unlike processAndUploadImage in ./images.ts there is no Supabase Storage
 * fallback: this action exists to put the asset on R2, and quietly landing it
 * somewhere else would be a success that is not one. Unconfigured R2 is an
 * error the admin sees.
 *
 * The bytes go server to R2 through the SDK client (one PutObject per
 * variant), not presign-then-fetch, so there is no credential in flight.
 */
async function runUploadImageToR2(formData: FormData): Promise<R2UploadResult> {
  let session: Awaited<ReturnType<typeof requireStaffSession>>
  try {
    session = await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  // Same budget as images.ts: the cost is the sharp encode, whichever action
  // triggers it.
  const decision = await rateLimit('admin-image-process', session.userId)
  if (!decision.allowed) {
    return { error: 'יותר מדי העלאות בשעה האחרונה. נסו שוב בעוד כמה דקות.' }
  }

  if (!isR2Configured()) return { error: 'אחסון התמונות אינו מוגדר' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'לא נבחר קובץ' }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { error: 'סוג קובץ לא נתמך' }
  if (file.size > MAX_ORIGINAL_BYTES) return { error: 'הקובץ גדול מדי (מקסימום 8MB)' }

  const altHe = String(formData.get('alt_he') ?? '').trim()
  if (!isValidHebrewAlt(altHe)) {
    return { error: 'חובה להזין טקסט חלופי בעברית (לפחות 3 תווים)' }
  }

  const folder = String(formData.get('folder') ?? 'misc')
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '') || 'misc'

  const original = Buffer.from(await file.arrayBuffer())
  let processed: Awaited<ReturnType<typeof processImage>>
  try {
    processed = await processImage(original)
  } catch {
    return { error: 'הקובץ אינו תמונה תקינה' }
  }

  const dimensionError = validateImageDimensions(processed.width, processed.height)
  if (dimensionError) return { error: dimensionError }

  const basePath = `${safeFolder}/${crypto.randomUUID()}`
  let upload: Awaited<ReturnType<typeof uploadImageVariants>>
  try {
    upload = await uploadImageVariants(basePath, original, processed)
  } catch (e) {
    return { error: `שגיאת העלאה: ${e instanceof Error ? e.message : 'unknown'}` }
  }

  const webp = upload.variants.filter((v) => v.format === 'webp')
  const avif = upload.variants.filter((v) => v.format === 'avif')
  const main = webp[0]
  const mainAvif = avif[0]
  if (!main || !mainAvif) return { error: 'שגיאה פנימית: לא נוצרו כל הגרסאות' }

  const admin = createAdminClient()
  const { data: asset, error: insertError } = await admin
    .from('media_assets')
    .insert({
      url: main.url,
      alt_he: altHe,
      blur_data_url: upload.blurDataURL,
      width: upload.width,
      height: upload.height,
      renditions: {
        webp: webp.map(({ width, url }) => ({ w: width, url })),
        avif: avif.map(({ width, url }) => ({ w: width, url })),
      },
      provider: 'r2',
      bucket: r2BucketFromEnv(),
      base_path: basePath,
      created_by: session.userId,
    })
    .select('id')
    .single()
  if (insertError) return { error: `שגיאת רישום: ${insertError.message}` }
  // A new asset is on no product yet, so this can make nothing stale today. It
  // is called anyway rather than taking a fourth DELIBERATE_EXCEPTIONS slot in
  // scripts/cache-invalidation-scan.mjs: one flush per rate-limited upload.
  updateTag(CATALOGUE_TAG)

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'media_assets',
    entityId: asset?.id ?? null,
    changes: { url: main.url, alt_he: altHe, provider: 'r2', base_path: basePath },
  })

  return {
    url: main.url,
    avifUrl: mainAvif.url,
    altHe,
    blurDataURL: upload.blurDataURL,
    width: upload.width,
    height: upload.height,
    variants: upload.variants,
  }
}

export async function uploadImageToR2(formData: FormData): Promise<R2UploadResult> {
  return withActionContext('admin.image.upload_r2', () => runUploadImageToR2(formData))
}
