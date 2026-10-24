import { getSessionWithRole, isAdminRole } from '@/lib/admin/rbac'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { importProductsCsv } from '@/server/actions/admin/product-import'
import type { NextRequest } from 'next/server'

/**
 * Programmatic twin of the /admin/products/import form.
 *
 * POST multipart: `file` (CSV) and `mode`. Without `mode=commit` this is a
 * dry run: every row is validated and returned, nothing is written. Commit is
 * a second request with the same file. Both go through the same
 * `importProductsCsv` the page uses, so the 185 columns, validation, drafts and
 * audit log behave identically on both paths.
 *
 * The admin guard is re-checked here and answers 403 JSON rather than the
 * `redirect('/login')` the page guard does, because an API caller wants a status.
 */
async function handlePOST(request: NextRequest) {
  const session = await getSessionWithRole()
  if (!session || !isAdminRole(session.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!(await checkRateLimit(`admin-product-import:${session.userId}`, 10, 3600))) {
    return Response.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': '3600' } },
    )
  }
  const formData = await request.formData().catch(() => null)
  if (!formData) return Response.json({ error: 'multipart form required' }, { status: 400 })

  const result = await importProductsCsv(null, formData)
  const status = result?.error ? 400 : 200
  return Response.json(result ?? { error: 'no result' }, { status })
}

export const POST = withRequestLog('/api/admin/products/import', handlePOST)
