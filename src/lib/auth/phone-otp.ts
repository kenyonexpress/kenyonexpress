import { normalizeIsraeliPhone } from '@/lib/whatsapp'

/**
 * Phone sign-in, for the large share of Israeli customers who have no Google
 * account and will not create one to buy a coupon.
 *
 * OFF UNLESS CONFIGURED, AND THE FLAG IS NOT A PREFERENCE. Supabase only sends
 * an SMS if a provider is wired into the project's auth settings, which is a
 * dashboard action nobody here can take from code. Without it every send fails
 * with a message the customer cannot act on. So the entry point is hidden until
 * `PHONE_AUTH_ENABLED` says the provider is live; a half-configured deployment
 * shows email sign-in only, which works.
 */
export function phoneAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PHONE_AUTH_ENABLED === 'true' || env.PHONE_AUTH_ENABLED === '1'
}

/** The same value, for the client bundle. Server and client must not disagree. */
export function phoneAuthEnabledPublic(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === 'true' || env.NEXT_PUBLIC_PHONE_AUTH_ENABLED === '1'
}

/**
 * E.164, which is the only format Supabase and Twilio accept.
 *
 * Built on `normalizeIsraeliPhone` rather than beside it: that function already
 * knows what an Israeli number looks like in every form a customer types
 * ("050-123-4567", "+972 50 1234567", "972501234567"), and a second parser
 * would drift from it the first time one of them was fixed. The only thing
 * added here is the `+`, which wa.me does not want and E.164 requires.
 */
export function toE164Israeli(raw: string | null | undefined): string | null {
  const digits = normalizeIsraeliPhone(raw)
  return digits ? `+${digits}` : null
}

/**
 * MOBILE ONLY, AND THIS IS A REFUSAL RATHER THAN A COURTESY. A landline passes
 * the format check, is accepted by the provider, and then the SMS is simply
 * never delivered - the customer sits on the code screen watching nothing
 * arrive, and the failure looks like our bug. Better to say it before spending
 * the message.
 */
export function isSmsCapableIsraeli(raw: string | null | undefined): boolean {
  const e164 = toE164Israeli(raw)
  if (!e164) return false
  // +9725XXXXXXXX: 05X is the mobile prefix block, and 13 characters is the
  // whole number including the plus.
  return e164.startsWith('+9725') && e164.length === 13
}

/** For display next to "we sent a code to", so the customer can spot a typo. */
export function maskPhone(e164: string): string {
  if (e164.length < 6) return e164
  const tail = e164.slice(-3)
  const head = e164.slice(0, 5)
  return `${head}${'*'.repeat(Math.max(0, e164.length - 8))}${tail}`
}

const ERRORS: Record<string, string> = {
  'Invalid phone': 'מספר הטלפון אינו תקין',
  'Signups not allowed for otp': 'ההרשמה בטלפון סגורה כרגע',
  // Longest first. The lookup returns on the first substring hit, so
  // 'Token has expired' placed above would swallow the combined message and
  // tell a customer whose code was simply WRONG to wait for it to expire.
  'Token has expired or is invalid': 'הקוד שגוי או שפג תוקפו',
  'Token has expired': 'הקוד פג תוקף, בקשו קוד חדש',
  'Invalid token': 'הקוד שגוי',
  'sms provider': 'שליחת SMS אינה זמינה כרגע',
  'Unsupported phone provider': 'שליחת SMS אינה זמינה כרגע',
  'Error sending confirmation': 'שליחת הקוד נכשלה, נסו שוב',
  over_sms_send_rate_limit: 'יותר מדי בקשות, המתינו דקה ונסו שוב',
  'Too many requests': 'יותר מדי ניסיונות, נסו שוב מאוחר יותר',
}

/**
 * Hebrew for the provider's English. Anything unrecognised collapses to one
 * generic line: an SMS gateway's raw error is operational detail and often
 * names the provider, the account, or the reason a number was rejected.
 */
export function phoneAuthErrorHebrew(message: string): string {
  for (const [needle, hebrew] of Object.entries(ERRORS)) {
    if (message.toLowerCase().includes(needle.toLowerCase())) return hebrew
  }
  return 'אירעה שגיאה, נסו שוב'
}
