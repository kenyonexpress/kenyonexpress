// Server-side upload of converted variants to R2 through presigned PUTs.

import 'server-only'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { type ConvertedVariant, convertToVariants } from './convert'
import { signedPutUrl } from './presign'

const IMMUTABLE = 'public, max-age=31536000, immutable'

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const url = await signedPutUrl(key, 120)
  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Cache-Control': IMMUTABLE },
    body: new Uint8Array(body),
  })
  if (!res.ok) throw new Error(`R2 PUT ${key} failed: ${res.status}`)
}

/**
 * Convert and upload. `baseKey` should be unique per upload (a uuid), because
 * variants are served immutable for a year.
 */
export async function processAndUploadImage(
  input: Buffer,
  baseKey: string,
): Promise<ConvertedVariant[]> {
  const variants = await convertToVariants(input, baseKey)
  for (const v of variants) await putObject(v.key, v.body, v.contentType)
  return variants
}
