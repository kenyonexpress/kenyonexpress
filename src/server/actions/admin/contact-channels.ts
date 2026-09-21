'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { CONTACT_CHANNELS_TAG, isContactChannelKey } from '@/lib/contact/channels'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeIsraeliPhone } from '@/lib/whatsapp'
import type { Json } from '@/types/database'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

export type ContactChannelActionState = { error: string } | { success: string } | null

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST106'])
const NOT_INSTALLED =
  'הטבלה contact_channels עדיין לא קיימת: מיגרציה 236 ממתינה. עד אז החנות מציגה את ברירות המחדל מהקוד.'

const channelSchema = z.object({
  key: z.string().refine(isContactChannelKey, 'נושא לא מוכר'),
  label_he: z.string().trim().min(2, 'נדרש שם לנושא').max(60),
  // Empty means "the store number"; anything else must be an Israeli number.
  number: z.string().trim().max(20),
  message_he: z.string().trim().min(5, 'נדרש פתיח').max(300),
  sort_order: z.coerce.number().int().min(0).max(1000),
  active: z.boolean(),
})

const configSchema = z.object({
  route_template: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9\-_/[\]]*$/, 'תבנית route לא תקינה')
    .max(80),
  channel_key: z.string().refine(isContactChannelKey, 'נושא לא מוכר'),
  message_he: z.string().trim().max(300),
  active: z.boolean(),
})

async function guard(): Promise<AdminSessionInfo | null> {
  try {
    return await requireSection('content', 'write')
  } catch {
    return null
  }
}

function reportError(error: { code?: string; message: string }): string {
  if (MISSING_TABLE.has(error.code ?? '')) return NOT_INSTALLED
  log.error('contact_channels.write_failed', { reason: error.message, code: error.code })
  return `השמירה נכשלה: ${error.message}`
}

/**
 * Upsert one topic. On the service key after the `content: write` guard:
 * the tables are public-read and have no write policy at all, by design
 * (236). Number is normalised to E.164 digits or cleared to "store number".
 */
async function runUpdateContactChannel(
  _: ContactChannelActionState,
  formData: FormData,
): Promise<ContactChannelActionState> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = channelSchema.safeParse({
    key: formData.get('key'),
    label_he: formData.get('label_he'),
    number: formData.get('number') ?? '',
    message_he: formData.get('message_he'),
    sort_order: formData.get('sort_order') ?? 0,
    active: formData.get('active') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  let number: string | null = null
  if (parsed.data.number !== '') {
    number = normalizeIsraeliPhone(parsed.data.number)
    if (!number) return { error: 'מספר הוואטסאפ אינו מספר ישראלי תקין' }
  }

  const admin = createAdminClient()
  const { data: before, error: readError } = await admin
    .from('contact_channels' as never)
    .select('key, label_he, number, message_he, sort_order, active')
    .eq('key', parsed.data.key)
    .maybeSingle()
  if (readError) return { error: reportError(readError) }

  const row = {
    key: parsed.data.key,
    label_he: parsed.data.label_he,
    number,
    message_he: parsed.data.message_he,
    sort_order: parsed.data.sort_order,
    active: parsed.data.active,
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin
    .from('contact_channels' as never)
    .upsert(row as never, { onConflict: 'key' })
  if (error) return { error: reportError(error) }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: before ? 'updated' : 'created',
    entityType: 'contact_channels',
    entityId: parsed.data.key,
    changes: { key: parsed.data.key },
    before: (before ?? null) as unknown as Json,
    after: { ...row, updated_by: null, updated_at: null } as unknown as Json,
  })

  updateTag(CONTACT_CHANNELS_TAG)
  revalidatePath('/admin/contact-channels')
  revalidatePath('/contact')
  return { success: 'הנושא נשמר' }
}

async function runUpdatePageContactConfig(
  _: ContactChannelActionState,
  formData: FormData,
): Promise<ContactChannelActionState> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = configSchema.safeParse({
    route_template: formData.get('route_template'),
    channel_key: formData.get('channel_key'),
    message_he: formData.get('message_he') ?? '',
    active: formData.get('active') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }

  const admin = createAdminClient()
  const { data: before, error: readError } = await admin
    .from('page_contact_config' as never)
    .select('route_template, channel_key, message_he, active')
    .eq('route_template', parsed.data.route_template)
    .maybeSingle()
  if (readError) return { error: reportError(readError) }

  const row = {
    route_template: parsed.data.route_template,
    channel_key: parsed.data.channel_key,
    message_he: parsed.data.message_he === '' ? null : parsed.data.message_he,
    active: parsed.data.active,
    updated_by: session.userId,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin
    .from('page_contact_config' as never)
    .upsert(row as never, { onConflict: 'route_template' })
  if (error) return { error: reportError(error) }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: before ? 'updated' : 'created',
    entityType: 'page_contact_config',
    entityId: null,
    changes: { route_template: parsed.data.route_template },
    before: (before ?? null) as unknown as Json,
    after: { ...row, updated_by: null, updated_at: null } as unknown as Json,
  })

  updateTag(CONTACT_CHANNELS_TAG)
  revalidatePath('/admin/contact-channels')
  return { success: 'ההגדרה נשמרה' }
}

export async function updateContactChannel(
  _: ContactChannelActionState,
  formData: FormData,
): Promise<ContactChannelActionState> {
  return withActionContext('admin.contact_channels.update', () =>
    runUpdateContactChannel(_, formData),
  )
}

export async function updatePageContactConfig(
  _: ContactChannelActionState,
  formData: FormData,
): Promise<ContactChannelActionState> {
  return withActionContext('admin.contact_channels.update_page_config', () =>
    runUpdatePageContactConfig(_, formData),
  )
}
