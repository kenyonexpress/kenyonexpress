import { log } from '@/lib/observability/log'

/**
 * GoTrue's English messages, mapped to the one Hebrew sentence each deserves.
 * Lived inside `server/actions/auth.ts` until UX24, when the registration
 * core moved out of that file so the /signup page, the register dialog and
 * the legacy redirecting action could share it; a `'use server'` module can
 * export nothing but actions, so the map had to move with it.
 */
const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'כתובת אימייל או סיסמה שגויים',
  'Email not confirmed': 'כתובת האימייל טרם אומתה — בדקו את תיבת הדואר',
  'User already registered': 'כתובת האימייל כבר רשומה במערכת',
  'Password should be at least 6 characters': 'הסיסמה חייבת להכיל לפחות 6 תווים',
  'Signup is disabled': 'ההרשמה סגורה כרגע',
  'Email rate limit exceeded': 'יותר מדי ניסיונות — נסו שוב מאוחר יותר',
  'Too many requests': 'יותר מדי ניסיונות — נסו שוב מאוחר יותר',
  /*
    THE ONLY WAY /reset-password FAILS FOR A REAL CUSTOMER, AND IT USED TO SAY
    NOTHING.

    `updateUser` is authorised by the recovery session the mail link opens, so
    a link that expired, was already used, or was never followed at all leaves
    no session and this is what Supabase returns. It was unmapped, so the page
    said "אירעה שגיאה, נסו שוב" - true, useless, and with no next step on a
    screen that has no other link on it.

    Not guessed. The string was READ OUT OF THE LOG that the unmapped-fallback
    warning below started writing: `auth.error_unmapped … reason: "Auth session
    missing!"`, from a direct visit to /reset-password. Sibling wordings for an
    expired link are deliberately NOT listed here - they have not been seen on
    this project, and the fallback now names anything new rather than hiding it.
  */
  'Auth session missing': 'קישור האיפוס פג או שכבר נעשה בו שימוש — בקשו קישור חדש',
  // What `verifyOtp` answers for a typed code that is wrong, reused, or older
  // than the project's OTP expiry. One sentence for all three on purpose:
  // distinguishing "wrong" from "expired" tells a guesser which digits to keep.
  'Token has expired or is invalid': 'הקוד שגוי או שפג תוקפו — בקשו קוד חדש',
}

/**
 * THE FALLBACK IS LOGGED, BECAUSE IT IS INDISTINGUISHABLE FROM WORKING.
 *
 * Every key above is an ENGLISH STRING SUPABASE CHOOSES, matched by substring.
 * Nothing here is under our control and nothing warns when one of them is
 * reworded upstream: the match simply stops firing, "כתובת אימייל או סיסמה
 * שגויים" quietly becomes "אירעה שגיאה, נסו שוב", and the sign-in form still
 * looks like it is behaving. The customer is told nothing useful and we are
 * told nothing at all.
 *
 * So an unmapped message is a warning with the message on it. The reason goes
 * to the log and never into the response - the same split the API routes are
 * held to by `log-coverage.test.ts`.
 */
export function gotrueErrorHebrew(msg: string): string {
  for (const [key, val] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return val
  }
  log.warn('auth.error_unmapped', { reason: msg })
  return 'אירעה שגיאה, נסו שוב'
}
