'use server'

import { requireStaffSession } from '@/lib/admin/rbac'
import { processImage } from '@/lib/images/process'
import { ALLOWED_IMAGE_TYPES, MAX_ORIGINAL_BYTES, isValidHebrewAlt } from '@/lib/images/validate'
import { withActionContext } from '@/lib/observability/action-context'
import { createR2PresignedPutUrl, isR2Configured, r2PublicUrl } from '@/lib/storage/r2'
import { createAdminClient } from '@/lib/supabase/admin'

export type UploadedAsset = {
  /** Main public URL (largest webp rendition). Stored in products.images etc. */
  url: string
  altHe: string
  blurDataURL: string
  width: number
  height: number
}

export type UploadImageResult = UploadedAsset | { error: string }

async function putToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const { uploadUrl } = await createR2PresignedPutUrl(key)
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: new Uint8Array(buffer),
    headers: { 'Content-Type': contentType },
  })
  if (!res.ok) throw new Error(`R2 upload failed (${res.status})`)
  return r2PublicUrl(key)
}

/**
 * Image pipeline entry point. Receives the ORIGINAL file (multipart FormData:
 * file, alt_he, folder, bucket), converts it server-side to compressed
 * webp/avif renditions + blur placeholder, uploads every rendition to R2
 * (or Supabase Storage when R2 is not configured), and registers the asset
 * with its mandatory Hebrew alt text in media_assets.
 */
async function runProcessAndUploadImage(formData: FormData): Promise<UploadImageResult> {
  let userId: string
  try {
    const session = await requireStaffSession()
    userId = session.userId
  } catch {
    return { error: 'אין הרשאה' }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'לא נבחר קובץ' }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { error: 'סוג קובץ לא נתמך' }
  if (file.size > MAX_ORIGINAL_BYTES) return { error: 'הקובץ גדול מדי (מקסימום 8MB)' }

  const altHe = String(formData.get('alt_he') ?? '').trim()
  if (!isValidHebrewAlt(altHe)) {
    return { error: 'חובה להזין טקסט חלופי בעברית (לפחות 3 תווים)' }
  }

  const folder = String(formData.get('folder') ?? 'misc')
  const bucket = String(formData.get('bucket') ?? 'product-images')
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '') || 'misc'

  let processed: Awaited<ReturnType<typeof processImage>>
  try {
    processed = await processImage(Buffer.from(await file.arrayBuffer()))
  } catch {
    return { error: 'הקובץ אינו תמונה תקינה' }
  }

  const basePath = `${safeFolder}/${crypto.randomUUID()}`
  const useR2 = isR2Configured()
  const admin = createAdminClient()

  const uploaded: { format: string; w: number; url: string }[] = []
  try {
    for (const rendition of processed.renditions) {
      const key = `${basePath}/w${rendition.width}.${rendition.format}`
      const contentType = `image/${rendition.format}`
      if (useR2) {
        const url = await putToR2(key, rendition.buffer, contentType)
        uploaded.push({ format: rendition.format, w: rendition.width, url })
      } else {
        const { error } = await admin.storage.from(bucket).upload(key, rendition.buffer, {
          contentType,
          cacheControl: '31536000',
          upsert: false,
        })
        if (error) throw new Error(error.message)
        const { data } = admin.storage.from(bucket).getPublicUrl(key)
        uploaded.push({ format: rendition.format, w: rendition.width, url: data.publicUrl })
      }
    }
  } catch (e) {
    return { error: `שגיאת העלאה: ${e instanceof Error ? e.message : 'unknown'}` }
  }

  const webp = uploaded.filter((u) => u.format === 'webp')
  const avif = uploaded.filter((u) => u.format === 'avif')
  const main = webp[0]
  if (!main) return { error: 'שגיאה פנימית: לא נוצרה תמונה ראשית' }

  const { error: insertError } = await admin.from('media_assets').insert({
    url: main.url,
    alt_he: altHe,
    blur_data_url: processed.blurDataURL,
    width: processed.width,
    height: processed.height,
    renditions: {
      webp: webp.map(({ w, url }) => ({ w, url })),
      avif: avif.map(({ w, url }) => ({ w, url })),
    },
    provider: useR2 ? 'r2' : 'supabase',
    bucket: useR2 ? process.env.R2_BUCKET : bucket,
    base_path: basePath,
    created_by: userId,
  })
  if (insertError) return { error: `שגיאת רישום: ${insertError.message}` }

  return {
    url: main.url,
    altHe,
    blurDataURL: processed.blurDataURL,
    width: processed.width,
    height: processed.height,
  }
}

export async function processAndUploadImage(formData: FormData): Promise<UploadImageResult> {
  return withActionContext('admin.image.process_and_upload', () =>
    runProcessAndUploadImage(formData),
  )
}
