// The optional watermark, read once from the environment.
//
// IMAGE_WATERMARK_FILE names a PNG or SVG on the server's filesystem (under
// the repo for a Vercel deploy, where `public/` and the source tree are the
// only files that exist at runtime). Unset, absent or unreadable all mean
// "no mark": a product upload must not fail because branding is
// misconfigured, so the miss is logged once and the pipeline runs unmarked.

import 'server-only'

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { log } from '@/lib/observability/log'
import type { WatermarkSpec } from './optimize.mjs'

let cached: Promise<WatermarkSpec | null> | null = null
let cachedFor: string | undefined

export function parseOpacity(raw: string | undefined, fallback = 0.35): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

export async function loadWatermark(
  env: Record<string, string | undefined> = process.env,
): Promise<WatermarkSpec | null> {
  const file = env.IMAGE_WATERMARK_FILE?.trim()
  if (!file) return null
  if (cached && cachedFor === file) return cached
  cachedFor = file
  cached = readFile(resolve(process.cwd(), file))
    .then((image) => ({ image, opacity: parseOpacity(env.IMAGE_WATERMARK_OPACITY) }))
    .catch((error: unknown) => {
      log.warn('images.watermark.unreadable', {
        file,
        err: error instanceof Error ? error : new Error(String(error)),
      })
      return null
    })
  return cached
}

/** Test seam. */
export function resetWatermarkCache(): void {
  cached = null
  cachedFor = undefined
}
