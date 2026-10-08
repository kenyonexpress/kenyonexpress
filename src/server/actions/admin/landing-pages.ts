'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { CacheTags } from '@/lib/cache/tags'
import type { LandingBlock, LandingPageStatus, LandingVariant } from '@/lib/landing/blocks'
import {
  landingSlugSchema,
  landingStatusSchema,
  parseJsonText,
  parseLandingBlocks,
  parseLandingVariants,
} from '@/lib/landing/schema'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * Admin writes for campaign landing pages (STEP 55).
 *
 * Gated on the catalog section with write access: a landing page is copy
 * (blocks, arms, links to the catalogue) and moves no money, so the content
 * role may author one, the same way it authors a product's description. The
 * action re-checks for itself because a server action is directly
 * addressable and a page guard does not protect it.
 *
 * Every save runs the SAME schema the storefront read applies, so a page
 * that saves is a page that renders; the field errors come back in Hebrew
 * with the JSON path of the offending block. The service role does the
 * write (RLS on 262 is admin-role only, and the content role is not that),
 * and every save lands in the audit log by slug.
 *
 * `updateTag(CacheTags.landing)` is the invalidation hook `read.ts` relies
 * on: the storefront's cached document is stale the moment this returns.
 */

const UNDEFINED_TABLE = '42P01'
const UNIQUE_VIOLATION = '23505'

const schema = z
  .object({
    id: z.string().uuid().optional(),
    slug: landingSlugSchema,
    title_he: z.string().min(2, 'נדרשת כותרת').max(200, 'כותרת ארוכה מדי'),
    description_he: z.string().max(400, 'תיאור ארוך מדי').nullable().optional(),
    hypothesis_he: z.string().max(600, 'השערה ארוכה מדי').nullable().optional(),
    status: landingStatusSchema,
    starts_at: z.string().nullable().optional(),
    ends_at: z.string().nullable().optional(),
    indexable: z.boolean(),
    campaign: z
      .string()
      .max(200, 'שם קמפיין ארוך מדי')
      .regex(/^[A-Za-z0-9_.-]*$/, 'שם קמפיין: אותיות לועזיות, ספרות, נקודה, מקף וקו תחתון')
      .nullable()
      .optional(),
    blocks_json: z.string().max(200_000, 'התוכן גדול מדי'),
    variants_json: z.string().max(200_000, 'הגרסאות גדולות מדי'),
  })
  .superRefine((v, ctx) => {
    if (v.starts_at && v.ends_at && new Date(v.starts_at) >= new Date(v.ends_at)) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'הסיום חייב להיות אחרי ההתחלה' })
    }
  })

export type LandingActionState = {
  ok: boolean
  id?: string
  slug?: string
  error?: string
  fieldErrors?: Record<string, string[]>
}

const blank = (value: unknown) => (value === '' || value === undefined ? null : value)

async function runSaveLandingPage(
  _prev: LandingActionState,
  formData: FormData,
): Promise<LandingActionState> {
  const session = await requireSection('catalog', 'write')

  const raw = Object.fromEntries(formData) as Record<string, unknown>
  const parsed = schema.safeParse({
    ...raw,
    id: blank(raw.id) ?? undefined,
    description_he: blank(raw.description_he),
    hypothesis_he: blank(raw.hypothesis_he),
    starts_at: blank(raw.starts_at),
    ends_at: blank(raw.ends_at),
    campaign: blank(raw.campaign),
    indexable: raw.indexable === 'on' || raw.indexable === 'true',
    blocks_json: typeof raw.blocks_json === 'string' ? raw.blocks_json : '',
    variants_json: typeof raw.variants_json === 'string' ? raw.variants_json : '',
  })
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const v = parsed.data

  const fieldErrors: Record<string, string[]> = {}
  let blocks: LandingBlock[] = []
  let variants: LandingVariant[] = []

  const blocksJson = parseJsonText(v.blocks_json)
  if (!blocksJson.ok) fieldErrors.blocks_json = blocksJson.errors
  else {
    const outcome = parseLandingBlocks(blocksJson.value)
    if (outcome.ok) blocks = outcome.value
    else fieldErrors.blocks_json = outcome.errors
  }

  const variantsJson = parseJsonText(v.variants_json)
  if (!variantsJson.ok) fieldErrors.variants_json = variantsJson.errors
  else {
    const outcome = parseLandingVariants(variantsJson.value)
    if (outcome.ok) variants = outcome.value
    else fieldErrors.variants_json = outcome.errors
  }

  if (blocks.length === 0 && !fieldErrors.blocks_json) {
    fieldErrors.blocks_json = ['עמוד צריך לפחות בלוק אחד']
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }

  const row = {
    slug: v.slug,
    title_he: v.title_he,
    description_he: v.description_he ?? null,
    hypothesis_he: v.hypothesis_he ?? null,
    status: v.status,
    starts_at: v.starts_at ?? null,
    ends_at: v.ends_at ?? null,
    indexable: v.indexable,
    campaign: v.campaign ?? null,
    blocks,
    variants,
  }

  const admin = createAdminClient()
  let id = v.id ?? null
  const result = v.id
    ? await admin
        .from('landing_pages' as never)
        .update(row as never)
        .eq('id', v.id)
        .select('id')
        .maybeSingle()
    : await admin
        .from('landing_pages' as never)
        .insert({ ...row, created_by: session.userId } as never)
        .select('id')
        .single()

  if (result.error) {
    if (result.error.code === UNDEFINED_TABLE) {
      return { ok: false, error: 'טבלת דפי הנחיתה עוד לא הוחלה (מיגרציה 262).' }
    }
    if (result.error.code === UNIQUE_VIOLATION) {
      return { ok: false, fieldErrors: { slug: ['כבר קיים דף עם הכתובת הזו'] } }
    }
    return { ok: false, error: `השמירה נכשלה: ${result.error.message}` }
  }
  id = (result.data as { id: string } | null)?.id ?? id
  if (!id) return { ok: false, error: 'הדף לא נמצא.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: v.id ? 'updated' : 'created',
    entityType: 'landing_page',
    entityId: id,
    changes: { slug: v.slug, status: v.status, variants: variants.map((variant) => variant.key) },
  })

  updateTag(CacheTags.landing)
  revalidatePath('/admin/landing-pages')
  revalidatePath(`/admin/landing-pages/${id}`)
  return { ok: true, id, slug: v.slug }
}

export async function saveLandingPage(
  prev: LandingActionState,
  formData: FormData,
): Promise<LandingActionState> {
  return withActionContext('admin.landing.save', () => runSaveLandingPage(prev, formData))
}

async function runSetLandingPageStatus(
  id: string,
  status: LandingPageStatus,
): Promise<LandingActionState> {
  const session = await requireSection('catalog', 'write')
  if (!/^[0-9a-f-]{36}$/i.test(id) || !landingStatusSchema.safeParse(status).success) {
    return { ok: false, error: 'קלט לא תקין.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('landing_pages' as never)
    .update({ status } as never)
    .eq('id', id)
    .select('id, slug')
    .maybeSingle()

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { ok: false, error: 'טבלת דפי הנחיתה עוד לא הוחלה (מיגרציה 262).' }
    }
    return { ok: false, error: 'העדכון נכשל.' }
  }
  if (!data) return { ok: false, error: 'הדף לא נמצא.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'landing_page',
    entityId: id,
    changes: { status: { to: status } },
  })

  updateTag(CacheTags.landing)
  revalidatePath('/admin/landing-pages')
  revalidatePath(`/admin/landing-pages/${id}`)
  return { ok: true, id, slug: (data as { slug: string }).slug }
}

export async function setLandingPageStatus(
  id: string,
  status: LandingPageStatus,
): Promise<LandingActionState> {
  return withActionContext('admin.landing.status', () => runSetLandingPageStatus(id, status))
}
