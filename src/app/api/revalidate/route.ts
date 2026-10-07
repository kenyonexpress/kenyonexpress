import {
  isRevalidatablePath,
  revalidateCachePaths,
  revalidateCacheTags,
} from '@/lib/cache/revalidate'
import { isKnownCacheTag } from '@/lib/cache/tags'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * On-demand cache invalidation for the storefront (STEP 36).
 *
 * The database webhook (`/api/webhooks/products`) covers every change that
 * reaches `products` or `categories`. This is the door for everything else
 * that knows the catalogue moved and has no row to point at: a deploy script
 * after a content change, a CMS that edited `homepage_sections`, an operator
 * with curl, a CI step after a bulk import. It takes the tags and paths from
 * `lib/cache/tags.ts` and `lib/cache/revalidate.ts` and nothing else, so the
 * secret buys "refresh the shop", not "purge whatever string I send".
 *
 * Auth: `Authorization: Bearer <REVALIDATE_SECRET>`, constant time. Closed
 * when the variable is unset, like every bearer-guarded route here
 * (`bearerMatches` compares against "" and never matches). No fallback to
 * CRON_SECRET: that secret already sits in an external scheduler, and a
 * purge endpoint should not be reachable with it.
 *
 * Semantics are `revalidateTag(tag, 'max')` and `revalidatePath(path)`:
 * stale-while-revalidate, never blocking. The caller has no reader waiting.
 *
 * ```
 * curl -X POST "$APP/api/revalidate" \
 *   -H "authorization: Bearer $REVALIDATE_SECRET" \
 *   -H "content-type: application/json" \
 *   -d '{"tags":["home"],"paths":["/"]}'
 * ```
 */

const MAX_ITEMS = 64

const bodySchema = z
  .object({
    tags: z.array(z.string().min(1).max(256)).max(MAX_ITEMS).optional(),
    paths: z.array(z.string().min(1).max(512)).max(MAX_ITEMS).optional(),
  })
  .strict()
  .refine((b) => (b.tags?.length ?? 0) + (b.paths?.length ?? 0) > 0, {
    message: 'tags or paths required',
  })

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  const tags = parsed.data.tags ?? []
  const paths = parsed.data.paths ?? []
  const unknownTags = tags.filter((tag) => !isKnownCacheTag(tag))
  const unknownPaths = paths.filter((path) => !isRevalidatablePath(path))
  if (unknownTags.length > 0 || unknownPaths.length > 0) {
    // 400, not a partial 200: a caller that mistyped `catalog` for
    // `catalogue` would otherwise read `ok: true` and ship nothing.
    return NextResponse.json(
      { ok: false, error: 'unknown target', tags: unknownTags, paths: unknownPaths },
      { status: 400 },
    )
  }

  const revalidated = {
    tags: revalidateCacheTags(tags),
    paths: revalidateCachePaths(paths),
  }
  log.info('cache.revalidated', { source: 'api', ...revalidated })
  return NextResponse.json({ ok: true, revalidated })
}

export const POST = withRequestLog('/api/revalidate', handlePOST)
