import { KILL_SWITCHES, type Subsystem, killSwitchReport } from '@/lib/resilience/kill-switches'

export type FeatureFlagView = {
  subsystem: Subsystem
  envName: string
  on: boolean
  labelHe: string
  degradedHe: string
}

const LABELS: Record<Subsystem, { labelHe: string; degradedHe: string }> = {
  cache: {
    labelHe: 'מטמון קטלוג',
    degradedHe: 'הקריאות עוברות ישר ל-Postgres. איטי יותר, אף פעם לא שגוי.',
  },
  search: {
    labelHe: 'חיפוש',
    degradedHe: 'תיבת החיפוש מחזירה רשימה ריקה במקום שגיאה.',
  },
  recs: {
    labelHe: 'המלצות',
    degradedHe: 'רצועות ההמלצה לא מוצגות. שאר העמוד נשאר.',
  },
  notifications: {
    labelHe: 'התראות יוצאות',
    degradedHe: 'מייל ודחיפה מדלגים. האירוע עצמו נשמר.',
  },
}

/**
 * Read-only view of the env kill switches.
 *
 * There is no flags table. An agent cannot apply a migration, so a deploy-free
 * admin toggle does not exist. This page reports what the current instance
 * is running, and the runbook says how to flip the variable.
 */
export function listFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlagView[] {
  const report = killSwitchReport(env)
  return (Object.keys(KILL_SWITCHES) as Subsystem[]).map((subsystem) => ({
    subsystem,
    envName: KILL_SWITCHES[subsystem],
    on: report[subsystem],
    labelHe: LABELS[subsystem].labelHe,
    degradedHe: LABELS[subsystem].degradedHe,
  }))
}

/**
 * THE SWITCHES THAT ARE NOT KILL SWITCHES, AND WHY THE PAGE NEEDED THEM.
 *
 * `KILL_SWITCHES` is a typed map with a specific contract: one subsystem, one
 * variable, and a DEGRADED PATH that is correct rather than broken. Four things
 * satisfy that, and the admin page listed exactly those four under the title
 * "system flags".
 *
 * Measured 2026-09-08: seven other environment variables gate real behaviour
 * and appeared nowhere. An operator opening that page saw four cache-and-search
 * toggles and would reasonably read it as the flag surface of the system.
 *
 * The absent one that matters is `CARDCOM_USE_MOCK`. KNOWN-ISSUES #1 records it
 * as the launch BLOCKER - production checkout runs against the mock provider -
 * and it is the switch that decides whether a charge is real. A page called
 * "system flags" that omits it is not merely incomplete; it is reassuring.
 *
 * They are listed separately rather than forced into `KILL_SWITCHES`, because
 * none of them has a degraded path in that sense: turning phone sign-in off
 * removes a feature, and turning the payment mock ON replaces real money with
 * pretend money. Same page, different table, different promise.
 */
export type OperationalFlagView = {
  envName: string
  on: boolean
  labelHe: string
  effectHe: string
  /** Money moves differently depending on this one. */
  money: boolean
}

const OPERATIONAL: { envName: string; labelHe: string; effectHe: string; money: boolean }[] = [
  {
    envName: 'CARDCOM_USE_MOCK',
    labelHe: 'ספק תשלומים מדומה',
    effectHe: 'כשדולק: הקופה מחייבת ספק מדומה ולא כרטיס אמיתי. אין תנועה כספית.',
    money: true,
  },
  {
    envName: 'PHONE_AUTH_ENABLED',
    labelHe: 'כניסה בטלפון',
    effectHe: 'כשכבוי: הכניסה מציגה אימייל בלבד. פעולת השרת מסרבת גם היא.',
    money: false,
  },
  {
    envName: 'PUSH_ENABLED',
    labelHe: 'התראות דחיפה',
    effectHe: 'כשכבוי: אין שליחה למכשירים. האירוע נשמר.',
    money: false,
  },
  {
    envName: 'ALERTS_ENABLED',
    labelHe: 'התראות תפעול',
    effectHe: 'כשכבוי: אזעקות לא נשלחות לטלפון. הן עדיין נרשמות.',
    money: false,
  },
  {
    envName: 'AI_AGENTS_ENABLED',
    labelHe: 'סוכני AI',
    effectHe: 'כשכבוי: המסלולים שמשתמשים במודל אינם פועלים.',
    money: false,
  },
  {
    envName: 'SENTRY_DEBUG_ROUTES',
    labelHe: 'מסלולי בדיקת Sentry',
    effectHe: 'כשדולק: /debug/sentry זורק שגיאות מכוונות. חייב להיות כבוי בפרודקשן.',
    money: false,
  },
]

/**
 * `on` is a deliberate value and not a truthiness check, matching
 * `kill-switches.ts`: a stray "0" or "false" copied into an env block must not
 * read as enabled.
 */
export function listOperationalFlags(env: NodeJS.ProcessEnv = process.env): OperationalFlagView[] {
  const isOn = (value: string | undefined) =>
    value === '1' || value === 'true' || value === 'on' || value === 'yes'
  return OPERATIONAL.map((flag) => ({ ...flag, on: isOn(env[flag.envName]) }))
}
