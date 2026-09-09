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
