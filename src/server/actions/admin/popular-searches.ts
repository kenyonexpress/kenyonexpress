'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Managing the terms the search box promotes.
 *
 * WRITTEN THROUGH THE ADMIN'S OWN SESSION, not the service role. The table's
 * RLS already says "staff may write"; using the admin client here would move
 * that rule out of the database and into this file, where a future edit can
 * silently lose it. `requireSection` is the second lock, not the only one.
 *
 * A TERM IS NOT A URL. `target_url` is optional and is restricted to a path on
 * this site: an operator pasting an external link would turn the site's own
 * search suggestions into an open redirect surface, and the whole point of the
 * feature is that these look like the site's own words.
 */

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  term: z.string().trim().min(2, 'מונח קצר מדי').max(60, 'מונח ארוך מדי'),
  target_url: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine(
      (value) => value === undefined || (value.startsWith('/') && !value.startsWith('//')),
      // `//evil.test` is a protocol-relative URL and is a path by any naive
      // check, which is exactly why the second clause is here.
      { message: 'קישור חייב להיות נתיב פנימי שמתחיל ב-/' },
    ),
  position: z.coerce.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(true),
})

export type PopularSearchState = { error: string } | { success: string } | null

async function runSave(_: PopularSearchState, formData: FormData): Promise<PopularSearchState> {
  const session = await requireSection('analytics', 'write')
  const supabase = await createClient()

  const parsed = upsertSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    term: formData.get('term'),
    target_url: formData.get('target_url'),
    position: formData.get('position') ?? 0,
    is_active: formData.get('is_active') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const row = {
    term: parsed.data.term,
    target_url: parsed.data.target_url ?? null,
    position: parsed.data.position,
    is_active: parsed.data.is_active,
  }

  const { error } = parsed.data.id
    ? await supabase.from('popular_searches').update(row).eq('id', parsed.data.id)
    : // Upsert on the term rather than insert: adding a term that already
      // exists is an operator meaning "make sure this is promoted", not an
      // error they should have to resolve by finding the old row.
      await supabase.from('popular_searches').upsert(row, { onConflict: 'term' })

  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: parsed.data.id ? 'updated' : 'created',
    entityType: 'popular_searches',
    entityId: parsed.data.id ?? parsed.data.term,
    metadata: { term: parsed.data.term },
  })

  revalidatePath('/admin/search')
  return { success: 'נשמר' }
}

async function runRemove(_: PopularSearchState, formData: FormData): Promise<PopularSearchState> {
  const session = await requireSection('analytics', 'write')
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { error: 'מזהה לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.from('popular_searches').delete().eq('id', id.data)
  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'popular_searches',
    entityId: id.data,
  })

  revalidatePath('/admin/search')
  return { success: 'נמחק' }
}

export async function savePopularSearch(
  state: PopularSearchState,
  formData: FormData,
): Promise<PopularSearchState> {
  return withActionContext('admin.popular_search_save', () => runSave(state, formData))
}

export async function removePopularSearch(
  state: PopularSearchState,
  formData: FormData,
): Promise<PopularSearchState> {
  return withActionContext('admin.popular_search_remove', () => runRemove(state, formData))
}
