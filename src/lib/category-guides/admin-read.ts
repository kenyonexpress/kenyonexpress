import 'server-only'

import { authoredGuideFor } from '@/lib/category-guides/authored'
import { type CategoryGuideRow, isMissingGuideSchema } from '@/lib/category-guides/rules'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The category editor's read of a guide (STEP 65): the row on the service
 * role behind the page's own `requireSection('catalog', 'write')` gate, and
 * whether the table exists at all, so the form can say "migration 268 is
 * pending" instead of failing the save after the editor has typed.
 *
 * `draft` is what the textarea opens with: the row when there is one, else
 * the authored fallback for the slug, else empty. The editor therefore sees
 * the text the storefront is showing right now, whichever source it is.
 */

export type AdminCategoryGuide = {
  tableExists: boolean
  row: CategoryGuideRow | null
  draft: { title_he: string | null; body_md: string; source: 'row' | 'authored' | 'none' }
}

export async function getAdminCategoryGuide(category: {
  id: string
  slug: string
}): Promise<AdminCategoryGuide> {
  const authored = authoredGuideFor(category.slug)
  const fallback: AdminCategoryGuide['draft'] = authored
    ? { title_he: authored.title_he, body_md: authored.body_md, source: 'authored' }
    : { title_he: null, body_md: '', source: 'none' }

  const { data, error } = await createAdminClient()
    .from('category_guides' as never)
    .select('category_id, title_he, body_md, is_published')
    .eq('category_id', category.id)
    .maybeSingle()

  if (error) {
    return { tableExists: !isMissingGuideSchema(error), row: null, draft: fallback }
  }
  const row = data as unknown as CategoryGuideRow | null
  if (!row) return { tableExists: true, row: null, draft: fallback }
  return {
    tableExists: true,
    row,
    draft: { title_he: row.title_he, body_md: row.body_md, source: 'row' },
  }
}
