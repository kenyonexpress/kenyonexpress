/**
 * Flash sales (STEP 61): the pure half.
 *
 * Everything here is a function of its inputs and a clock the caller passes
 * in, so a test can hand it rows and read the answer. The database half
 * (`read.ts`, the server actions, the definer functions in migration 266)
 * owns every write; this file owns what a phase is, which sale the home page
 * shows, how a claim outcome reads in Hebrew, and how the countdown is
 * shaped.
 *
 * MONEY IS INTEGER AGOROT throughout. `price_agorot` and `reference_agorot`
 * come off the row as integers and are formatted by `shekels`; nothing here
 * divides.
 */

export type FlashSalePhase = 'upcoming' | 'live' | 'ended' | 'off'

export type FlashSale = {
  id: string
  product_id: string
  name_he: string
  price_agorot: number
  reference_agorot: number | null
  allocation: number
  max_per_claim: number
  hold_minutes: number
  starts_at: string
  ends_at: string
  is_active: boolean
}

export type FlashClaimStatus = 'held' | 'queued' | 'consumed' | 'released' | 'expired'

export type FlashClaim = {
  status: FlashClaimStatus
  quantity: number
  position: number | null
  expires_at: string | null
  order_id: string | null
}

/** What `claim_flash_sale` (266) can answer in its `outcome` column. */
export type ClaimOutcome =
  | 'held'
  | 'queued'
  | 'consumed'
  | 'not_started'
  | 'ended'
  | 'inactive'
  | 'not_found'
  | 'bad_quantity'

export const CLAIM_OUTCOMES: ReadonlySet<string> = new Set<ClaimOutcome>([
  'held',
  'queued',
  'consumed',
  'not_started',
  'ended',
  'inactive',
  'not_found',
  'bad_quantity',
])

export function isClaimOutcome(value: unknown): value is ClaimOutcome {
  return typeof value === 'string' && CLAIM_OUTCOMES.has(value)
}

/** The home banner shows an upcoming sale only when it opens within this. */
export const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000

/** How often the waiting room asks the status route, in milliseconds. */
export const STATUS_POLL_MS = 8_000

export const flashSalePath = (id: string): string => `/flash/${encodeURIComponent(id)}`

export function phaseOf(sale: Pick<FlashSale, 'starts_at' | 'ends_at' | 'is_active'>, now: Date) {
  if (!sale.is_active) return 'off' as const
  const start = Date.parse(sale.starts_at)
  const end = Date.parse(sale.ends_at)
  if (Number.isNaN(start) || Number.isNaN(end)) return 'off' as const
  const t = now.getTime()
  if (t < start) return 'upcoming' as const
  if (t >= end) return 'ended' as const
  return 'live' as const
}

/**
 * The one sale the home banner shows: the live sale that ends soonest, or,
 * when none is live, the next one to open within `UPCOMING_WINDOW_MS`.
 * Null is the ordinary state and the banner renders nothing.
 */
export function pickHomeFlashSale<T extends FlashSale>(sales: readonly T[], now: Date): T | null {
  const live = sales
    .filter((s) => phaseOf(s, now) === 'live')
    .sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at) || a.id.localeCompare(b.id))
  if (live[0]) return live[0]
  const soon = sales
    .filter(
      (s) =>
        phaseOf(s, now) === 'upcoming' &&
        Date.parse(s.starts_at) - now.getTime() <= UPCOMING_WINDOW_MS,
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id))
  return soon[0] ?? null
}

/** Units still open at the flash price, never negative. */
export function remainingOf(allocation: number, taken: number): number {
  return Math.max(0, Math.trunc(allocation) - Math.max(0, Math.trunc(taken)))
}

/** Whole seconds until `iso`, floored at zero; null for an unparseable value. */
export function secondsUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.floor((at - now.getTime()) / 1000))
}

/**
 * Whether a claim still entitles its holder to the flash price. A hold bound
 * to an order is the order's now and stays live past its own expiry; an
 * unbound hold lives until `expires_at`.
 */
export function isLiveHold(
  claim: Pick<FlashClaim, 'status' | 'expires_at' | 'order_id'>,
  now: Date,
) {
  if (claim.status !== 'held') return false
  if (claim.order_id) return true
  const left = secondsUntil(claim.expires_at, now)
  return left !== null && left > 0
}

/** The shopper-facing line for each outcome the claim RPC can return. */
export const CLAIM_OUTCOME_HE: Record<ClaimOutcome, string> = {
  held: 'תפסתם יחידה! השלימו את הרכישה לפני שהזמן נגמר.',
  queued: 'כל היחידות תפוסות כרגע. אתם בחדר ההמתנה, ונעדכן ברגע שתתפנה יחידה.',
  consumed: 'כבר רכשתם במבצע הזה.',
  not_started: 'המבצע עוד לא התחיל.',
  ended: 'המבצע הסתיים.',
  inactive: 'המבצע אינו פעיל.',
  not_found: 'המבצע לא נמצא.',
  bad_quantity: 'הכמות שביקשתם גדולה מהמותר במבצע הזה.',
}

/** The percentage badge, basis points to a whole percent, half up. */
export function percentOff(priceAgorot: number, referenceAgorot: number | null): number {
  if (referenceAgorot === null || referenceAgorot <= priceAgorot || referenceAgorot <= 0) return 0
  return Math.round(((referenceAgorot - priceAgorot) / referenceAgorot) * 100)
}

/**
 * What a database without 266 answers. Postgres says `42P01`; PostgREST,
 * which the anon client talks to, answers `PGRST205` before Postgres is ever
 * asked. Both read as "no flash sales". `42883` is the function form: an RPC
 * that does not exist yet.
 */
const MISSING_CODES = new Set(['42P01', 'PGRST205', '42883', 'PGRST202'])

export function isMissingFlashSchema(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code && MISSING_CODES.has(error.code)) return true
  return /relation .* does not exist|could not find the (table|function)|function .* does not exist/i.test(
    error.message ?? '',
  )
}
