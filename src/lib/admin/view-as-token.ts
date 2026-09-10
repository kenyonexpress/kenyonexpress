import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The grant that opens a customer's screens to an operator, and the reason it
 * is a signed cookie rather than a swapped session.
 *
 * =========================================================================
 * WHAT "IMPERSONATE READ ONLY" IS HERE, AND WHAT IT DELIBERATELY IS NOT
 * =========================================================================
 *
 * The obvious build is to swap `auth.uid()` for the target's and let the
 * operator walk the real storefront. It was measured and rejected:
 * **82 call sites read `supabase.auth.getUser()` directly** and there is no
 * single session helper to override. Making the storefront answer as somebody
 * else means editing all 82, in a tree that includes checkout, and read-only
 * would then rest on every one of those paths continuing to be read-only --
 * enforced by nothing but attention. The first write that slipped through
 * would be attributed to the CUSTOMER, in `orders` or `wallet_entries`, and
 * the audit row would name them and not the operator.
 *
 * So the grant is scoped to an admin-panel surface, `/admin/users/[id]/view-as`,
 * which renders what the customer sees using admin reads. Read-only is then
 * STRUCTURAL: it is a page with no form on it, not a session with a promise
 * attached. The banner and the audit row the section asks for are real; the
 * ability to act as the customer is absent because it was never safe to add.
 * `docs/CUSTOMER-SUPPORT-TOOLS.md` records this as a deviation, not a gap.
 *
 * =========================================================================
 * WHY THE COOKIE EXISTS AT ALL, GIVEN THE PAGE IS ALREADY GATED
 * =========================================================================
 *
 * `requireSection('users', 'write')` already keeps everyone but an admin out.
 * The cookie enforces something the section gate cannot: that the AUDIT ROW
 * AND ITS REASON WERE WRITTEN FIRST. Without it, `/admin/users/<id>/view-as`
 * is a URL, and a URL can be typed -- so an operator could read a customer's
 * whole history and leave no record of having done it, which is the one thing
 * the feature is supposed to prevent. The grant is minted only by
 * `startCustomerViewAs`, which writes the audit row before it mints, so
 * possession of the cookie IS the evidence that the record exists.
 *
 * =========================================================================
 * THE KEY IS DERIVED. NO NEW ENVIRONMENT VARIABLE.
 * =========================================================================
 *
 * `VOUCHER_QR_SECRET` is unset in production and every voucher scan 500s
 * because of it. `lib/orders/tracking-token.ts` settled the pattern after that:
 * derive from a secret the server definitionally already has, since a process
 * that cannot read `SUPABASE_SECRET_KEY` cannot read the customer either. A
 * different label than the tracking link's, so the two keys are unrelated and
 * neither token is valid in the other's place.
 */

const VERSION = 'KEV1'
const DERIVATION_LABEL = 'admin-view-as/v1'

/** The cookie name. Host-only, HttpOnly, SameSite=Lax; options live at the call site. */
export const VIEW_AS_COOKIE = 'ke_view_as'

/**
 * Short on purpose. A support call is minutes; a grant that outlived the shift
 * would be a standing read on somebody's order history that nobody renewed and
 * nobody revoked.
 */
export const VIEW_AS_TTL_SECONDS = 30 * 60

export class ViewAsSecretMissingError extends Error {
  constructor() {
    super('no secret available to sign a view-as grant')
    this.name = 'ViewAsSecretMissingError'
  }
}

export function viewAsSigningKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const base = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || base.length < 20) throw new ViewAsSecretMissingError()
  return createHmac('sha256', base).update(DERIVATION_LABEL, 'utf8').digest()
}

interface GrantPayload {
  v: 1
  /** The customer being viewed. */
  t: string
  /** The operator who opened it. Bound in so a grant cannot be handed to a colleague. */
  a: string
  /** Expiry, unix seconds. */
  e: number
}

function sign(input: string, key: Buffer): string {
  return createHmac('sha256', key).update(input, 'utf8').digest('base64url')
}

export interface MintViewAsOptions {
  ttlSeconds?: number
  now?: Date
  env?: NodeJS.ProcessEnv
}

export function mintViewAsGrant(
  targetUserId: string,
  actorId: string,
  options: MintViewAsOptions = {},
): string {
  const now = options.now ?? new Date()
  const payload: GrantPayload = {
    v: 1,
    t: targetUserId,
    a: actorId,
    e: Math.floor(now.getTime() / 1000) + (options.ttlSeconds ?? VIEW_AS_TTL_SECONDS),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const input = `${VERSION}.${body}`
  return `${input}.${sign(input, viewAsSigningKey(options.env))}`
}

export type ViewAsVerdict =
  | { ok: true; targetUserId: string; actorId: string; expiresAt: Date }
  | {
      ok: false
      reason: 'absent' | 'malformed' | 'bad_signature' | 'expired' | 'wrong_target' | 'wrong_actor'
    }

/**
 * BOTH ids are required, and neither is optional for the same reason the
 * tracking token's order id is not.
 *
 * `expectedTarget` because the page has the id in its path and would otherwise
 * happily render customer B for a grant minted over customer A -- one audit
 * row, two customers read.
 *
 * `expectedActor` because a cookie is a bearer credential. Without the bind, an
 * operator who obtained a grant could hand the string to somebody whose own
 * session never passed `requireSection`, and the audit row would name the
 * wrong person. The session gate still runs; this makes the two agree.
 */
export function verifyViewAsGrant(
  token: string | null | undefined,
  expectedTarget: string,
  expectedActor: string,
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
): ViewAsVerdict {
  const raw = (token ?? '').trim()
  if (!raw) return { ok: false, reason: 'absent' }
  if (raw.length < 20 || raw.length > 512) return { ok: false, reason: 'malformed' }

  const parts = raw.split('.')
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' }
  const body = parts[1] ?? ''
  const mac = parts[2] ?? ''

  let expected: string
  try {
    expected = sign(`${VERSION}.${body}`, viewAsSigningKey(options.env))
  } catch {
    return { ok: false, reason: 'bad_signature' }
  }

  const a = Buffer.from(mac, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }

  let payload: GrantPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GrantPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (
    payload?.v !== 1 ||
    typeof payload.t !== 'string' ||
    typeof payload.a !== 'string' ||
    typeof payload.e !== 'number'
  ) {
    return { ok: false, reason: 'malformed' }
  }

  const now = options.now ?? new Date()
  if (payload.e * 1000 <= now.getTime()) return { ok: false, reason: 'expired' }
  if (payload.t !== expectedTarget) return { ok: false, reason: 'wrong_target' }
  if (payload.a !== expectedActor) return { ok: false, reason: 'wrong_actor' }

  return {
    ok: true,
    targetUserId: payload.t,
    actorId: payload.a,
    expiresAt: new Date(payload.e * 1000),
  }
}

export type ViewAsRefusal = Extract<ViewAsVerdict, { ok: false }>['reason']

export const VIEW_AS_REFUSALS: Record<ViewAsRefusal, string> = {
  absent: 'צפייה כלקוח נפתחת מדף הלקוח, עם ציון סיבה',
  malformed: 'ההרשאה לצפייה אינה תקינה',
  bad_signature: 'ההרשאה לצפייה אינה תקינה',
  expired: 'ההרשאה לצפייה פגה. יש לפתוח שוב מדף הלקוח',
  wrong_target: 'ההרשאה שייכת ללקוח אחר',
  wrong_actor: 'ההרשאה נפתחה על ידי משתמש אחר',
}
