import { canReadSection } from '@/lib/admin/permissions'
import { getSessionWithRole } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildEvidencePack, evidencePackText } from '@/server/domain/disputes/evidence'
import { loadDisputeEvidence } from '@/server/queries/disputes'
import type { NextRequest } from 'next/server'

/**
 * The chargeback evidence pack, as a downloadable file.
 *
 * A ROUTE AND NOT A SERVER ACTION, for the reason the report export already
 * records: a download is an `<a href>`, and producing one from an action costs
 * a client bundle and the `Content-Disposition`.
 *
 * THE GUARD IS RE-CHECKED HERE. This is a plain GET at a guessable URL and the
 * body is the customer's name, address, transaction references and redemption
 * history assembled into one document - the single most sensitive artefact this
 * admin produces. 403 rather than `requireSection`, because a redirect in
 * answer to a download arrives as a file called `evidence` containing a login
 * page.
 *
 * `payments` and not `orders`: support can read orders, and a dispute pack is
 * money and PII, not order status.
 */
async function handleGET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const session = await getSessionWithRole()
  if (!session || !canReadSection(session.role, 'payments')) {
    log.warn('disputes.evidence_denied', { disputeId: id, role: session?.role ?? null })
    return new Response('אין הרשאה', { status: 403 })
  }

  const admin = createAdminClient()
  const evidence = await loadDisputeEvidence(admin, id)
  if (evidence === 'NOT_APPLIED') {
    return new Response('טבלת התיקים לא הוחלה. ראו migrations/pending/202_fraud_abuse.sql', {
      status: 503,
    })
  }
  if (!evidence) return new Response('תיק לא נמצא', { status: 404 })

  const pack = buildEvidencePack({ ...evidence, generatedAt: new Date() })

  const format = new URL(request.url).searchParams.get('format')
  if (format === 'json') {
    return Response.json(pack, {
      headers: {
        'content-disposition': `attachment; filename="evidence-${pack.reference}.json"`,
        // Never cached anywhere. This is one customer's identity documents.
        'cache-control': 'no-store',
      },
    })
  }

  // Plain text is the default because the destination is a form on an
  // acquirer's portal that takes pasted prose, not a machine.
  return new Response(evidencePackText(pack), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="evidence-${pack.reference}.txt"`,
      'cache-control': 'no-store',
    },
  })
}

export const GET = withRequestLog('admin.dispute_evidence', handleGET)
