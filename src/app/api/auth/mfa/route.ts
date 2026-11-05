import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { isSameOriginRequest } from '@/lib/security/same-origin'
import { getClientIp } from '@/lib/utils/rate-limit'
import {
  enrolTotp,
  issueBackupCodes,
  mfaStatus,
  redeemBackupCode,
  verifyTotp,
} from '@/server/mfa/service'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * `/api/auth/mfa` (G6, 05.11.2026): the staff MFA ceremonies as JSON, for the
 * account security page and for the mobile app. Same service as the server
 * actions; the caller is always the cookie session, never a body field.
 *
 *   GET                                     -> status (factor, levels, backup codes left)
 *   POST {"action":"enroll"}                -> {factorId, qrSvg, secret}
 *   POST {"action":"verify","factorId","code"} -> {ok, enrolled}
 *   POST {"action":"backup_codes"}          -> {codes[8], issuedAt}   (aal2 only)
 *   POST {"action":"redeem","code"}         -> {ok, remaining}        (resets the factor)
 *
 * Writes require a same-origin request: a cross-site form cannot set
 * `content-type: application/json`, and the origin check closes the rest.
 */
const ACTIONS = new Set(['enroll', 'verify', 'backup_codes', 'redeem'])

async function handleGET(): Promise<NextResponse> {
  const status = await mfaStatus()
  if (!status.signedIn) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })
  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } })
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'cross_origin' }, { status: 403 })
  }
  // Per address, in front of the per-user limits each ceremony applies.
  const decision = await rateLimit('mfa-api', await getClientIp())
  if (!decision.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }
  const action = typeof body.action === 'string' ? body.action : ''
  if (!ACTIONS.has(action)) return NextResponse.json({ error: 'unknown_action' }, { status: 400 })

  const status = await mfaStatus()
  if (!status.signedIn) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })

  const headers = { 'cache-control': 'no-store' }
  switch (action) {
    case 'enroll': {
      const r = await enrolTotp()
      return r.ok
        ? NextResponse.json({ factorId: r.factorId, qrSvg: r.qrSvg, secret: r.secret }, { headers })
        : NextResponse.json({ error: r.error }, { status: 400, headers })
    }
    case 'verify': {
      const r = await verifyTotp({
        factorId: typeof body.factorId === 'string' ? body.factorId : '',
        code: typeof body.code === 'string' ? body.code : '',
      })
      return r.ok
        ? NextResponse.json({ ok: true, enrolled: r.enrolled }, { headers })
        : NextResponse.json({ error: r.error }, { status: 400, headers })
    }
    case 'backup_codes': {
      const r = await issueBackupCodes()
      return r.ok
        ? NextResponse.json({ codes: r.codes, issuedAt: r.issuedAt }, { headers })
        : NextResponse.json({ error: r.error }, { status: 403, headers })
    }
    default: {
      const r = await redeemBackupCode({ code: typeof body.code === 'string' ? body.code : '' })
      return r.ok
        ? NextResponse.json({ ok: true, remaining: r.remaining }, { headers })
        : NextResponse.json({ error: r.error }, { status: 400, headers })
    }
  }
}

export const GET = withRequestLog('/api/auth/mfa', handleGET)
export const POST = withRequestLog('/api/auth/mfa', handlePOST)
