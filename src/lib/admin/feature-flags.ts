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

/**
 * THE OBSERVABILITY STACK'S OWN STATUS, WHICH NOTHING ELSE REPORTS.
 *
 * `/api/ready` checks seven dependencies - database, search, storage, cardcom,
 * email, rate_limiter, scheduler - and deliberately checks neither Sentry nor
 * Axiom. That is correct: a readiness probe answers "can this instance serve
 * traffic", and error reporting being down does not stop the shop working.
 * Putting them there would take the shop out of rotation for a reporting
 * outage.
 *
 * But it leaves both silently inert with nowhere to look. `axiom.ts` says so in
 * its own opening line - "ENTIRELY INERT without AXIOM_TOKEN + AXIOM_DATASET" -
 * and an unset Sentry DSN produces no error either, only silence where the
 * reports would be. The thing that tells you everything else is broken is the
 * one thing nothing tells you about.
 *
 * So they are reported here, where an operator already reads the environment,
 * and NOT in the readiness probe.
 *
 * PRESENCE ONLY, NEVER THE VALUE. `AXIOM_TOKEN` is a credential and the DSNs
 * are semi-public but still not this page's business. Every entry below renders
 * as configured or not, and the value never leaves the process.
 */
export type CapabilityView = {
  labelHe: string
  envNames: string[]
  configured: boolean
  whenAbsentHe: string
}

const CAPABILITIES: { labelHe: string; envNames: string[]; whenAbsentHe: string }[] = [
  {
    labelHe: 'שילוח לוגים ל-Axiom',
    envNames: ['AXIOM_TOKEN', 'AXIOM_DATASET'],
    whenAbsentHe:
      'הלוגים נכתבים ל-console בלבד, כלומר ל-log drain של Vercel. שום שגיאה לא נזרקת, ולכן היעדר הגדרה נראה בדיוק כמו הצלחה.',
  },
  {
    labelHe: 'דיווח שגיאות שרת (Sentry)',
    envNames: ['SENTRY_DSN'],
    whenAbsentHe: 'שגיאות שרת אינן מדווחות. הן עדיין נכתבות ללוג.',
  },
  {
    labelHe: 'דיווח שגיאות דפדפן (Sentry)',
    envNames: ['NEXT_PUBLIC_SENTRY_DSN'],
    whenAbsentHe: 'שגיאות בדפדפן אינן מדווחות כלל, גם לא ללוג.',
  },
]

/** Configured means every variable the capability needs is non-empty. */
export function listCapabilities(env: NodeJS.ProcessEnv = process.env): CapabilityView[] {
  return CAPABILITIES.map((capability) => ({
    ...capability,
    configured: capability.envNames.every((name) => Boolean(env[name])),
  }))
}
