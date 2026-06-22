import { createClient } from '@/lib/supabase/client'

export type UploadBucket = 'product-images' | 'vendor-logos' | 'category-icons' | 'coupon-images'

const BUCKET_CONFIG: Record<UploadBucket, { maxBytes: number; allowedTypes: string[] }> = {
  'product-images': {
    maxBytes: 5 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  },
  'vendor-logos': {
    maxBytes: 2 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
  'category-icons': {
    maxBytes: 1 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
  'coupon-images': {
    maxBytes: 3 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  },
}

export function validateFile(file: File, bucket: UploadBucket): string | null {
  const cfg = BUCKET_CONFIG[bucket]
  if (!cfg.allowedTypes.includes(file.type)) {
    return `סוג קובץ לא נתמך. מותרים: ${cfg.allowedTypes.join(', ')}`
  }
  if (file.size > cfg.maxBytes) {
    const mb = (cfg.maxBytes / 1024 / 1024).toFixed(0)
    return `הקובץ גדול מדי. מקסימום ${mb}MB`
  }
  return null
}

export async function uploadImage(
  file: File,
  bucket: UploadBucket,
  folder: string,
): Promise<{ url: string; path: string }> {
  const err = validateFile(file, bucket)
  if (err) throw new Error(err)

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`

  const supabase = createClient()
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw new Error(`שגיאת העלאה: ${error.message}`)

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { url: data.publicUrl, path }
}

export async function deleteImage(bucket: UploadBucket, path: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw new Error(`שגיאת מחיקה: ${error.message}`)
}
