'use server'

import { requireStaffSession } from '@/lib/admin/rbac'
import { createR2PresignedPutUrl, isR2Configured, r2PublicUrl } from '@/lib/storage/r2'

// Returned to the client so it knows how to upload a single file. When R2 is
// configured the client PUTs directly to `uploadUrl` and stores `publicUrl`.
// Otherwise it falls back to the Supabase Storage helper (uploadImage).
export type UploadTarget =
  | { provider: 'r2'; uploadUrl: string; publicUrl: string }
  | { provider: 'supabase' }
  | { error: string }

function extOf(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : 'jpg'
}

/**
 * Ask the server for a place to upload one image. Staff only.
 * `folder` is the R2 / bucket key prefix, e.g. "products".
 */
export async function requestUploadUrl(folder: string, fileName: string): Promise<UploadTarget> {
  try {
    await requireStaffSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  if (!isR2Configured()) return { provider: 'supabase' }

  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '') || 'misc'
  const key = `${safeFolder}/${crypto.randomUUID()}.${extOf(fileName)}`

  try {
    const { uploadUrl } = await createR2PresignedPutUrl(key)
    return { provider: 'r2', uploadUrl, publicUrl: r2PublicUrl(key) }
  } catch {
    // If signing fails for any reason, degrade to Supabase rather than blocking uploads.
    return { provider: 'supabase' }
  }
}
