// The purge webhook's payload, reduced to bucket keys. Pure, apart from the
// key allowlist it shares with the proxy route: a purge for a key the proxy
// would never serve is a purge of nothing, and is reported as rejected.

import { isServableImageKey } from '@/lib/storage/r2-read'
import { z } from 'zod'
import { LOCAL_CDN_PREFIX, LOCAL_PRODUCTS_PREFIX, R2_PROXY_PREFIX } from './r2-paths'

export const MAX_PURGE_KEYS = 64

const manualSchema = z.object({
  keys: z.array(z.string().min(1).max(512)).max(MAX_PURGE_KEYS).optional(),
  paths: z.array(z.string().min(1).max(512)).max(MAX_PURGE_KEYS).optional(),
  all: z.boolean().optional(),
})

const supabaseSchema = z.object({
  type: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  table: z.string(),
  record: z.object({ url: z.string().optional() }).passthrough().nullable().optional(),
  old_record: z.object({ url: z.string().optional() }).passthrough().nullable().optional(),
})

export type PurgeKeys = { keys: string[]; all: boolean; rejected: string[] }

/** A stored path or an absolute URL, reduced to the bucket key it serves, or null. */
export function keyFromPath(input: string): string | null {
  let path = input
  if (/^https?:\/\//.test(input)) {
    try {
      path = new URL(input).pathname
    } catch {
      return null
    }
  }
  let key: string | null = null
  if (path.startsWith(R2_PROXY_PREFIX)) key = path.slice(R2_PROXY_PREFIX.length)
  else if (path.startsWith(LOCAL_PRODUCTS_PREFIX))
    key = `products/${path.slice(LOCAL_PRODUCTS_PREFIX.length)}`
  else if (path.startsWith(LOCAL_CDN_PREFIX)) key = path.slice(LOCAL_CDN_PREFIX.length)
  if (!key) return null
  try {
    key = decodeURIComponent(key)
  } catch {
    return null
  }
  return isServableImageKey(key) ? key : null
}

/**
 * Manual `{ keys, paths, all }` first; a Supabase Database Webhook change
 * on `media_assets` second (keys off `record.url` / `old_record.url`); any
 * other table is an empty, acknowledged purge; anything else is null.
 */
export function keysFromBody(json: unknown): PurgeKeys | null {
  const manual = manualSchema.safeParse(json)
  if (manual.success && (manual.data.keys || manual.data.paths || manual.data.all !== undefined)) {
    const rejected: string[] = []
    const keys = new Set<string>()
    for (const key of manual.data.keys ?? []) {
      if (isServableImageKey(key)) keys.add(key)
      else rejected.push(key)
    }
    for (const path of manual.data.paths ?? []) {
      const key = keyFromPath(path)
      if (key) keys.add(key)
      else rejected.push(path)
    }
    return { keys: [...keys], all: manual.data.all === true, rejected }
  }

  const change = supabaseSchema.safeParse(json)
  if (change.success) {
    if (change.data.table !== 'media_assets') return { keys: [], all: false, rejected: [] }
    const keys = new Set<string>()
    for (const url of [change.data.record?.url, change.data.old_record?.url]) {
      const key = url ? keyFromPath(url) : null
      if (key) keys.add(key)
    }
    return { keys: [...keys], all: false, rejected: [] }
  }
  return null
}
