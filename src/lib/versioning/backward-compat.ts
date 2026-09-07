/**
 * Backward compatibility for older request payloads (MEGA 195). Pure.
 *
 * A client pinned to an older version keeps sending that version's shape long
 * after the handler has moved on. This walks such a payload forward one version
 * at a time until it matches what the current handler expects, so exactly one
 * shape reaches the business logic.
 *
 * ONE STEP PER VERSION, CHAINED, not one big `if` per old version. With N
 * versions the chain needs N-1 transforms; a per-version branch needs one for
 * every (old, current) pair and every one of them has to be revisited on the
 * next release. The chain also makes each step independently testable.
 *
 * The draft this replaces was `if (version < currentVersion)` on two strings.
 * See `compareApiVersions` for why that comparison is a bug and not a shortcut.
 */

import { CURRENT_API_VERSION, compareApiVersions, parseApiVersion } from './api-versioning'

/** Transforms one version's payload into the next version's shape. */
export type PayloadTransform<T = Record<string, unknown>> = (payload: T) => T

export interface UpgradeStep<T = Record<string, unknown>> {
  /** Version this step reads. */
  from: string
  /** Version this step produces. Must be exactly one step newer. */
  to: string
  transform: PayloadTransform<T>
}

/**
 * Orders the registered steps into a path from `fromVersion` to `toVersion`.
 *
 * Throws on a gap rather than skipping it. A missing step means some version's
 * shape has no described upgrade, and running the remaining steps over a
 * payload that never went through it produces a plausible-looking wrong object.
 */
export function buildUpgradePath<T>(
  steps: readonly UpgradeStep<T>[],
  fromVersion: string,
  toVersion: string = CURRENT_API_VERSION,
): readonly UpgradeStep<T>[] {
  const from = parseApiVersion(fromVersion)
  const to = parseApiVersion(toVersion)
  if (from == null) throw new TypeError(`not an api version: ${fromVersion}`)
  if (to == null) throw new TypeError(`not an api version: ${toVersion}`)

  const direction = compareApiVersions(from, to)
  if (direction === 0) return []
  if (direction === 1) {
    throw new RangeError(`cannot downgrade a payload: ${from} -> ${to}`)
  }

  const byFrom = new Map<string, UpgradeStep<T>>()
  for (const step of steps) {
    const key = parseApiVersion(step.from)
    if (key == null) throw new TypeError(`step.from is not an api version: ${step.from}`)
    if (byFrom.has(key)) {
      throw new TypeError(`two upgrade steps start at ${key}; the path would be ambiguous`)
    }
    byFrom.set(key, step)
  }

  const path: UpgradeStep<T>[] = []
  let cursor = from
  while (compareApiVersions(cursor, to) === -1) {
    const step = byFrom.get(cursor)
    if (!step) {
      throw new RangeError(`no upgrade step registered from ${cursor}; cannot reach ${to}`)
    }
    path.push(step)
    const next = parseApiVersion(step.to)
    if (next == null) throw new TypeError(`step.to is not an api version: ${step.to}`)
    if (compareApiVersions(next, cursor) !== 1) {
      throw new RangeError(`upgrade step ${step.from} -> ${step.to} does not move forward`)
    }
    cursor = next
  }
  return path
}

/**
 * Applies every step between the caller's version and the current one.
 *
 * Returns the payload untouched when the caller is already current, so the
 * common path allocates nothing and a no-op cannot reshape anything.
 */
export function upgradePayload<T>(
  payload: T,
  fromVersion: string,
  steps: readonly UpgradeStep<T>[],
  toVersion: string = CURRENT_API_VERSION,
): T {
  const path = buildUpgradePath(steps, fromVersion, toVersion)
  return path.reduce((current, step) => step.transform(current), payload)
}

/**
 * Renames a field, leaving everything else alone. The single most common shape
 * change between two versions, and worth having once rather than in each step.
 *
 * A rename whose source key is absent is a no-op: a payload that already uses
 * the new name passes through unchanged instead of gaining an `undefined`.
 */
export function renameField<T extends Record<string, unknown>>(
  from: string,
  to: string,
): PayloadTransform<T> {
  return (payload) => {
    if (!payload || typeof payload !== 'object' || !(from in payload)) return payload
    const { [from]: moved, ...rest } = payload as Record<string, unknown>
    return { ...rest, [to]: moved } as T
  }
}

/** Fills a field the newer version requires and the older one never sent. */
export function defaultField<T extends Record<string, unknown>>(
  field: string,
  value: unknown,
): PayloadTransform<T> {
  return (payload) => {
    if (!payload || typeof payload !== 'object') return payload
    if (payload[field] !== undefined) return payload
    return { ...payload, [field]: value } as T
  }
}
