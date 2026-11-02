'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import {
  type DealTemplate,
  type RawValues,
  TEMPLATE_SLUG_RE,
  type TemplateField,
  buildProductWrite,
  validateDeal,
} from '@/lib/deal-templates/common'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils/slugify'
import { upsertProductNoRedirect } from '@/server/actions/admin/products'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const TEMPLATE_SELECT =
  'slug, name_he, product_type, category_slug, fields, defaults, is_system, parent_slug'

async function loadTemplate(slug: string): Promise<DealTemplate | null> {
  const { data } = await createAdminClient()
    .from('deal_templates' as never)
    .select(TEMPLATE_SELECT)
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()
  return (data as DealTemplate | null) ?? null
}

const fieldSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,40}$/, 'מפתח שדה: אותיות לטיניות קטנות, ספרות וקו תחתון'),
  label: z.string().trim().min(2, 'תווית שדה: לפחות 2 תווים').max(60),
  type: z.enum([
    'text',
    'textarea',
    'int',
    'money',
    'select',
    'multiselect',
    'bool',
    'list',
    'date',
  ]),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  default: z.unknown().optional(),
})

const cloneSchema = z.object({
  source_slug: z.string().regex(TEMPLATE_SLUG_RE),
  slug: z.string().regex(TEMPLATE_SLUG_RE, 'מזהה תבנית: אותיות לטיניות קטנות, ספרות ומקפים'),
  name_he: z.string().trim().min(2, 'שם התבנית: לפחות 2 תווים').max(80),
  fields: z.array(fieldSchema).min(1, 'תבנית צריכה לפחות שדה אחד'),
})

export type CloneTemplateResult = { ok: true; slug: string } | { ok: false; error: string }

/**
 * "Create new master from the closest one": copies the source's type,
 * category and defaults, takes the edited field list, and saves it for
 * future deals (is_system = false, parent_slug = source).
 */
export async function cloneDealTemplate(input: unknown): Promise<CloneTemplateResult> {
  return withActionContext('admin.deal_template.clone', async () => {
    const session = await requireSection('catalog', 'write')
    const parsed = cloneSchema.safeParse(input)
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
    const { source_slug, slug, name_he, fields } = parsed.data
    const keys = new Set<string>()
    for (const fd of fields) {
      if (keys.has(fd.key)) return { ok: false, error: `שדה כפול: ${fd.key}` }
      keys.add(fd.key)
      if ((fd.type === 'select' || fd.type === 'multiselect') && !fd.options?.length) {
        return { ok: false, error: `${fd.label}: נדרשות אפשרויות בחירה` }
      }
    }
    const source = await loadTemplate(source_slug)
    if (!source) return { ok: false, error: 'תבנית המקור לא נמצאה' }
    const fieldKeys = new Set(fields.map((fd) => fd.key))
    // Keep the common defaults (validity, shipping, cashback ...) and the
    // defaults of the fields that survived the edit; drop the removed ones.
    const sourceKeys = new Set(source.fields.map((sf) => sf.key))
    const defaults = Object.fromEntries(
      Object.entries(source.defaults ?? {}).filter(([k]) => {
        const key = k.replace(/_agorot$/, '')
        return !sourceKeys.has(key) || fieldKeys.has(key)
      }),
    )
    const { error } = await createAdminClient()
      .from('deal_templates' as never)
      .insert({
        slug,
        name_he,
        product_type: source.product_type,
        category_slug: source.category_slug,
        fields: fields as TemplateField[],
        defaults,
        is_system: false,
        parent_slug: source.slug,
        created_by: session.userId,
      } as never)
    if (error) {
      return { ok: false, error: error.code === '23505' ? 'מזהה התבנית כבר קיים' : error.message }
    }
    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'created',
      entityType: 'deal_templates',
      entityId: slug,
      changes: { parent_slug: source.slug, name_he, field_keys: [...fieldKeys] },
    })
    revalidatePath('/admin/products/new')
    return { ok: true, slug }
  })
}

export type CreateDealResult =
  | { ok: true; id: string; slug: string; published: boolean }
  | { ok: false; error: string; errors?: Record<string, string> }

const createSchema = z.object({
  template_slug: z.string().regex(TEMPLATE_SLUG_RE),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.boolean()])),
  images: z.array(z.string().min(1)).max(8),
  supplier_id: z.string().uuid().nullable(),
  publish: z.boolean(),
})

async function freeSlug(base: string): Promise<string> {
  const admin = createAdminClient()
  const root = base.length >= 2 ? base.slice(0, 80) : 'deal'
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`
    const { data } = await admin.from('products').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }
  return `${root}-${Date.now().toString(36)}`
}

/** Step 2 submit: validate against the master, then the existing product write. */
export async function createDealFromTemplate(input: unknown): Promise<CreateDealResult> {
  return withActionContext('admin.deal_template.create_product', async () => {
    const session = await requireSection('catalog', 'write')
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'נתונים לא תקינים' }
    const { template_slug, values, images, supplier_id, publish } = parsed.data
    const template = await loadTemplate(template_slug)
    if (!template) return { ok: false, error: 'התבנית לא נמצאה' }

    const admin = createAdminClient()
    const { data: cats } = await admin.from('categories').select('id').is('deleted_at', null)
    const result = validateDeal(template, values as RawValues, {
      categoryIds: (cats ?? []).map((c) => c.id),
      publish,
      imageCount: images.length,
    })
    if (!result.ok) {
      return { ok: false, error: Object.values(result.errors).join(' · '), errors: result.errors }
    }
    // A role that cannot see money cannot publish a priced deal; it saves a draft.
    const canPublish = publish && canSeeMoney(session.role)
    const slug = await freeSlug(slugify(String(result.values.title)))
    const write = buildProductWrite(template, result.values, {
      slug,
      supplierId: supplier_id,
      images,
      publish: canPublish,
    })

    const fd = new FormData()
    for (const [k, v] of Object.entries(write.form)) fd.set(k, v)
    const saved = await upsertProductNoRedirect(fd)
    if (!saved || 'error' in saved) return { ok: false, error: saved?.error ?? 'שמירת המוצר נכשלה' }
    const id = saved.id
    if (!id) return { ok: false, error: 'שמירת המוצר נכשלה' }

    const { error } = await admin
      .from('products')
      .update({ attributes: write.attributes, cashback_percent: write.cashbackPercent } as never)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true, id, slug, published: canPublish }
  })
}
