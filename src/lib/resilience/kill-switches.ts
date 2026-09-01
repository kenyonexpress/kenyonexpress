import { log } from '@/lib/observability/log'

/**
 * One switch per subsystem, so a failing dependency can be taken out of the
 * request path without shipping code.
 *
 * WHAT "WITHOUT A DEPLOY" HONESTLY MEANS HERE. These read `process.env` at CALL
 * time, not at module load, so a serverless instance picks a changed value up
 * as soon as it is given one. On Vercel that still means the env change has to
 * reach a new instance -- it is not the same as a database-backed flag flipped
 * from an admin page and honoured by every running instance within a second.
 *
 * A truly deploy-free switch needs a table, and this repository applies no
 * migrations from an agent, so that table does not exist yet. Naming the limit
 * is the point: someone reading this in an incident needs to know whether
 * flipping the variable is enough, and the answer is "on the next instance,
 * not on the one currently serving the request that woke you".
 *
 * WHY READ PER CALL AT ALL, GIVEN THAT. Because a module-load read is strictly
 * worse: it pins the value for the whole lifetime of a warm instance, which can
 * be hours. The same reasoning is already written down in
 * `rate-limit/upstash.ts`, which reads its config per call for exactly this
 * reason.
 */

/** The subsystems that may be switched off. Each one has a degraded path. */
export const KILL_SWITCHES = {
  /**
   * Skip the cache layer and read straight from Postgres.
   *
   * Correct by construction rather than by fallback: everything cached here is
   * derived from the database, so skipping the cache is slower and never wrong.
   */
  cache: 'KILL_SWITCH_CACHE',
  /**
   * Turn off search. The route answers an empty result set rather than an
   * error, because a search box that returns nothing is a degraded shop and a
   * search box that 500s is a broken one.
   */
  search: 'KILL_SWITCH_SEARCH',
  /** Recommendation strips render nothing rather than erroring the page. */
  recs: 'KILL_SWITCH_RECS',
  /**
   * Suppress outbound notifications (email, push). The event is still recorded;
   * only the send is skipped, so nothing is lost that cannot be resent.
   */
  notifications: 'KILL_SWITCH_NOTIFICATIONS',
} as const

export type Subsystem = keyof typeof KILL_SWITCHES

/**
 * `true` only for a value that plainly says so.
 *
 * Deliberately strict. A kill switch that is on by accident takes a working
 * subsystem out of the shop, so an unset, empty, malformed or
 * cased-differently value all mean OFF, and only `1` / `true` / `on` / `yes`
 * mean ON.
 */
function isOn(raw: string | undefined): boolean {
  if (!raw) return false
  return ['1', 'true', 'on', 'yes'].includes(raw.trim().toLowerCase())
}

/** Is this subsystem switched OFF? */
export function isKilled(subsystem: Subsystem, env: NodeJS.ProcessEnv = process.env): boolean {
  const killed = isOn(env[KILL_SWITCHES[subsystem]])
  if (killed) {
    // One line per skipped call is the point: an incident is easier to read
    // when the log says which subsystem was deliberately off.
    log.warn('kill_switch.active', { subsystem })
  }
  return killed
}

/**
 * Run `operation`, or return `degraded` if this subsystem is switched off.
 *
 * The degraded value is a thunk so that building it costs nothing on the normal
 * path, which is the path taken every time except during an incident.
 */
export async function withKillSwitch<T>(
  subsystem: Subsystem,
  operation: () => Promise<T>,
  degraded: () => T,
  env: NodeJS.ProcessEnv = process.env,
): Promise<T> {
  if (isKilled(subsystem, env)) return degraded()
  return operation()
}

/** Every switch and its current state, for the health endpoint and the runbook. */
export function killSwitchReport(env: NodeJS.ProcessEnv = process.env): Record<Subsystem, boolean> {
  return {
    cache: isOn(env[KILL_SWITCHES.cache]),
    search: isOn(env[KILL_SWITCHES.search]),
    recs: isOn(env[KILL_SWITCHES.recs]),
    notifications: isOn(env[KILL_SWITCHES.notifications]),
  }
}
