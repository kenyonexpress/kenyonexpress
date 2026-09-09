'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { HOMEPAGE_NOT_APPLIED, homepageTableMissing } from '@/lib/admin/homepage'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { SECTION_CONFIG_SCHEMAS, SECTION_KINDS } from '@/lib/homepage/sections'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * The homepage console's writes.
 *
 * ADMIN ONLY. The home page is the one page every visitor lands on, and a
 * section is a scheduled claim about a price. `content_uploader` loads
 * catalogue copy; this is merchandising, and it sits in the `content` section
 * added for [58].
 *
 * `updateTag(CATALOGUE_TAG)` on every path, plus `revalidatePath('/')`. Both
 * are needed and they do different jobs: the tag expires the cached rail reads
 * in `lib/homepage/rails.ts`, and the path invalidates the prerendered home
 * page itself. Only the second one moves what a visitor sees, and only the
 * first one changes which products are in the row.
 *
 * THE SCHEDULE IS NOT VALIDATED AGAINST THE CLOCK HERE, and that is
 * deliberate. 206 adds `ends_at > starts_at`, which is the invariant that can
 * be wrong; "starts in the past" is a legitimate thing to save, because
 * back-dating a start is how an operator turns a section on immediately with
 * an end date already set.
 */

export type HomepageActionState = { error: string } | { success: string } | null

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name)
  return typeof value === 'string' ? value : undefined
}

/** Empty string from a form input means "not set", not an empty timestamp. */
function timestampOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed.length === 0) return null
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

const sectionSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(SECTION_KINDS),
  titleHe: z.string().trim().max(200).optional(),
  subtitleHe: z.string().trim().max(300).optional(),
  position: z.coerce.number().int().min(0).max(9999),
  isActive: z.boolean(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  config: z.string().max(4000).optional(),
})

/**
 * Parse the config box for the chosen kind.
 *
 * The form posts JSON text. A structured form per kind would be four forms,
 * and the kinds are four keys each - so this is a textarea with the schema
 * enforced on the way in, and the console prints the expected keys beside it.
 * The error message names the field zod refused rather than saying "invalid",
 * because "invalid" for a config box is a guessing game.
 */
function parseConfig(kind: string, raw: string | undefined): Record<string, unknown> | string {
  const text = raw?.trim() ?? ''
  const schema = SECTION_CONFIG_SCHEMAS[kind as keyof typeof SECTION_CONFIG_SCHEMAS]
  // The seven kinds from 127 take no configuration at all.
  if (!schema) return {}
  if (text.length === 0) return 'הסוג הזה דורש הגדרות. ראו את המפתחות שמופיעים ליד התיבה.'

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return 'ההגדרות אינן JSON תקין.'
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    // 206's CHECK refuses this too; refusing here names the problem instead of
    // showing a constraint name.
    return 'ההגדרות חייבות להיות אובייקט, לא רשימה או מחרוזת.'
  }

  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return `שדה ${issue?.path.join('.') ?? '?'}: ${issue?.message ?? 'לא תקין'}`
  }
  return parsed.data as Record<string, unknown>
}

async function runSaveSection(
  _: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = sectionSchema.safeParse({
    id: field(formData, 'id') || undefined,
    kind: field(formData, 'kind'),
    titleHe: field(formData, 'titleHe'),
    subtitleHe: field(formData, 'subtitleHe'),
    position: field(formData, 'position') ?? '0',
    isActive: formData.get('isActive') === 'on' || formData.get('isActive') === 'true',
    startsAt: field(formData, 'startsAt'),
    endsAt: field(formData, 'endsAt'),
    config: field(formData, 'config'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  const input = parsed.data

  const config = parseConfig(input.kind, input.config)
  if (typeof config === 'string') return { error: config }

  const startsAt = timestampOrNull(input.startsAt)
  const endsAt = timestampOrNull(input.endsAt)
  // Refused here as well as by 206's CHECK, because this is the mistake the
  // constraint exists for and a sentence beats a constraint name. The row it
  // prevents is active, scheduled, correct-looking in the list, and matches the
  // live view never.
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return { error: 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה. אחרת הסעיף לא יופיע אף פעם.' }
  }

  const row = {
    kind: input.kind,
    title_he: input.titleHe?.trim() || null,
    subtitle_he: input.subtitleHe?.trim() || null,
    position: input.position,
    is_active: input.isActive,
    starts_at: startsAt,
    ends_at: endsAt,
    // The column is `jsonb` and the generated type is `Json`. The value has
    // already been through the kind's zod schema, so what is being asserted
    // here is that a parsed object is JSON - which it is, having just come out
    // of `JSON.parse`.
    config: config as Json,
  }

  const admin = createAdminClient()
  const result = input.id
    ? await admin
        .from('homepage_sections')
        .update(row)
        .eq('id', input.id)
        .select('id')
        .maybeSingle()
    : await admin.from('homepage_sections').insert(row).select('id').maybeSingle()

  if (result.error) {
    if (homepageTableMissing(result.error)) return { error: HOMEPAGE_NOT_APPLIED }
    // 206 is what permits the four new kinds. Until it is applied the CHECK
    // from 127 refuses them, and the operator should be told which file rather
    // than shown `homepage_sections_kind_check`.
    if (result.error.message.includes('homepage_sections_kind_check')) {
      return {
        error:
          'הסוג הזה דורש את migrations/pending/206_homepage_merchandising.sql, שעדיין לא הוחלה.',
      }
    }
    log.error('admin.homepage_section_save_failed', { reason: result.error.message })
    return { error: 'השמירה נכשלה' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: input.id ? 'updated' : 'created',
    entityType: 'homepage_section',
    entityId: result.data?.id ?? input.id ?? null,
    changes: {
      kind: input.kind,
      position: input.position,
      is_active: input.isActive,
      config: config as Json,
    },
  })

  await invalidate()
  return { success: 'הסעיף נשמר' }
}

const toggleSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() })

async function runToggleSection(
  _: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = toggleSchema.safeParse({
    id: field(formData, 'id'),
    isActive: field(formData, 'isActive') === 'true',
  })
  if (!parsed.success) return { error: 'קלט לא תקין' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('homepage_sections')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)

  if (error) {
    if (homepageTableMissing(error)) return { error: HOMEPAGE_NOT_APPLIED }
    log.error('admin.homepage_toggle_failed', { reason: error.message })
    return { error: 'העדכון נכשל' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'homepage_section',
    entityId: parsed.data.id,
    changes: { is_active: parsed.data.isActive },
  })

  await invalidate()
  return { success: parsed.data.isActive ? 'הסעיף הופעל' : 'הסעיף כובה' }
}

const reorderSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['up', 'down']),
})

/**
 * Move one section past its neighbour.
 *
 * TWO BUTTONS AND NOT DRAG AND DROP, and the reason is not effort. A drag
 * reorder posts the whole list, so two operators reordering at once each
 * overwrite the other's positions wholesale and neither is told. Swapping with
 * a neighbour writes two rows and touches nothing else, so the worst case of a
 * collision is one section a place off rather than a list silently reverted.
 * The list is fewer than a dozen rows; the drag would save a few seconds a
 * month.
 */
async function runReorderSection(
  _: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = reorderSchema.safeParse({
    id: field(formData, 'id'),
    direction: field(formData, 'direction'),
  })
  if (!parsed.success) return { error: 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('homepage_sections')
    .select('id, position')
    .order('position', { ascending: true })

  if (error) {
    if (homepageTableMissing(error)) return { error: HOMEPAGE_NOT_APPLIED }
    return { error: 'הקריאה נכשלה' }
  }

  const rows = data ?? []
  const index = rows.findIndex((row) => row.id === parsed.data.id)
  if (index === -1) return { error: 'הסעיף לא נמצא' }
  const neighbour = parsed.data.direction === 'up' ? index - 1 : index + 1
  if (neighbour < 0 || neighbour >= rows.length) return { error: 'הסעיף כבר בקצה' }

  const a = rows[index]
  const b = rows[neighbour]
  if (!a || !b) return { error: 'הסעיף לא נמצא' }

  // Two positions can be EQUAL - `position` has no unique constraint and 127
  // defaults every row to 0 - and swapping two equal numbers moves nothing. So
  // the target takes the neighbour's slot and the neighbour takes the index,
  // which orders them even when they started identical.
  const [first, second] =
    parsed.data.direction === 'up' ? [b.position, b.position + 1] : [b.position, b.position - 1]

  const updates = await Promise.all([
    admin.from('homepage_sections').update({ position: first }).eq('id', a.id),
    admin.from('homepage_sections').update({ position: second }).eq('id', b.id),
  ])
  const failed = updates.find((update) => update.error)
  if (failed?.error) {
    log.error('admin.homepage_reorder_failed', { reason: failed.error.message })
    return { error: 'הסידור נכשל' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'homepage_section',
    entityId: a.id,
    changes: { moved: parsed.data.direction, position: first },
  })

  await invalidate()
  return { success: 'הסדר עודכן' }
}

/**
 * Expire the cached rails and the prerendered home page.
 *
 * Both, and they are not the same thing: the tag covers the product reads in
 * `lib/homepage/rails.ts`, and the path covers the prerendered `/` that holds
 * the section order itself. Doing only the tag leaves the old order on a page
 * whose products have changed, which is the confusing half of the bug.
 */
async function invalidate(): Promise<void> {
  updateTag(CATALOGUE_TAG)
  revalidatePath('/')
  revalidatePath('/admin/homepage')
}

export async function saveHomepageSection(
  state: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  return withActionContext('admin.homepage_section_save', () => runSaveSection(state, formData))
}

export async function toggleHomepageSection(
  state: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  return withActionContext('admin.homepage_section_toggle', () => runToggleSection(state, formData))
}

export async function reorderHomepageSection(
  state: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  return withActionContext('admin.homepage_section_reorder', () =>
    runReorderSection(state, formData),
  )
}
