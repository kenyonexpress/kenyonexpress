'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { NATIONWIDE_LABEL } from '@/lib/geo/nationwide'
import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const PAGE = '/admin/products/missing-location'

const locationSchema = z.object({
  id: z.string().uuid(),
  city: z.string().trim().min(2).max(60),
  full_address: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === '' ? null : v)),
})

/**
 * Sets one product's city (and optionally its street address) from the
 * missing-location list. Writing the nationwide label back is refused: the row
 * would only reappear on the same list.
 */
async function runSetProductLocation(formData: FormData): Promise<void> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('catalog', 'write')
  } catch {
    redirect(`${PAGE}?error=forbidden`)
  }

  const parsed = locationSchema.safeParse({
    id: formData.get('id'),
    city: formData.get('city') ?? '',
    full_address: formData.get('full_address') ?? '',
  })
  if (!parsed.success || parsed.data.city === NATIONWIDE_LABEL) {
    redirect(`${PAGE}?error=invalid`)
  }
  const { id, city, full_address } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ city, full_address } as never)
    .eq('id', id)
  if (error) redirect(`${PAGE}?error=save_failed`)

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'products',
    entityId: id,
    changes: { old: { city: NATIONWIDE_LABEL }, new: { city, full_address } },
  })

  revalidatePath(PAGE)
  updateTag(CATALOGUE_TAG)
  redirect(`${PAGE}?saved=1`)
}

export async function setProductLocation(formData: FormData): Promise<void> {
  return withActionContext('admin.product.set_location', () => runSetProductLocation(formData))
}
