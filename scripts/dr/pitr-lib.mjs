/**
 * Pure logic behind `pitr-status.mjs`: is Point-in-Time Recovery actually
 * purchased on the hosted Supabase project, and what RPO does that buy?
 *
 * WHY THIS IS NOT A DATABASE QUESTION. docs/DISASTER-RECOVERY.md §2 measured
 * `archive_mode=on` and `wal_level=logical` on production and correctly refused
 * to conclude anything from them: Supabase archives WAL on every Pro project to
 * build its own daily backup, whether or not the PITR add-on was ever bought.
 * There is no query that separates the two cases, so the doc ended in "ask Ofir
 * to open the dashboard".
 *
 * There is an answer, and it lives in billing, not in Postgres. The Management
 * API exposes the applied add-ons of a project, and PITR is one of them
 * (`pitr_7` / `pitr_14` / `pitr_28`). That turns a standing question into a
 * command. The parsing is here so it can be tested without a token.
 *
 * WHAT THIS CANNOT DO. It proves the add-on is *paid for*, which is the fact
 * that was missing. It does not prove a restore-to-timestamp works; only a
 * drill does that, and a drill needs a project to restore into.
 */

/** Every add-on variant id Supabase issues for PITR, newest list 2026-09-10. */
export const PITR_VARIANT_RE = /^pitr_(\d+)$/

/** RPO when there is no PITR: the Pro plan's automatic backup runs daily. */
export const DAILY_BACKUP_RPO_HOURS = 24

/**
 * The add-on `type` and `variant` fields are documented as objects carrying an
 * `id`, but the same API has shipped them as bare strings. Reading both costs
 * four lines and removes a whole class of "reported PITR off while it was on".
 */
function idOf(field) {
  if (typeof field === 'string') return field
  if (field && typeof field === 'object') {
    for (const key of ['id', 'identifier', 'name', 'type', 'variant']) {
      if (typeof field[key] === 'string') return field[key]
    }
  }
  return null
}

/**
 * The PITR add-on among a project's *selected* add-ons, or null.
 *
 * `available_addons` is deliberately ignored: it lists what could be bought,
 * and reading it as state is exactly how a report says "PITR: yes" about an
 * account that pays for nothing.
 */
export function findPitrAddon(payload) {
  const selected = Array.isArray(payload?.selected_addons) ? payload.selected_addons : []
  for (const addon of selected) {
    const variantId = idOf(addon?.variant)
    const typeId = idOf(addon?.type)
    const match = PITR_VARIANT_RE.exec(variantId ?? '') ?? PITR_VARIANT_RE.exec(typeId ?? '')
    if (match) {
      return { variantId: variantId ?? typeId, retentionDays: Number(match[1]) }
    }
  }
  return null
}

/**
 * The verdict a human and an exit code both read.
 *
 * `enabled: false` is a measurement, not an error: a Pro project without the
 * add-on is a supported (and cheaper) configuration. What must never happen is
 * the third state being reported as either of the first two, so a payload this
 * function cannot make sense of returns `enabled: null`.
 */
export function pitrVerdict(payload) {
  const selected = payload?.selected_addons
  if (!Array.isArray(selected)) {
    return {
      enabled: null,
      retentionDays: null,
      rpo: 'unknown',
      reason:
        'response has no selected_addons array; the API shape changed or the body is an error',
    }
  }
  const addon = findPitrAddon(payload)
  if (!addon) {
    return {
      enabled: false,
      retentionDays: null,
      rpo: `<= ${DAILY_BACKUP_RPO_HOURS}h`,
      reason: `no pitr_* add-on among ${selected.length} selected add-on(s); the daily automatic backup is the only recovery point`,
    }
  }
  return {
    enabled: true,
    retentionDays: addon.retentionDays,
    rpo: '<= 2m',
    reason: `add-on ${addon.variantId} is applied; recovery points go back ${addon.retentionDays} days`,
  }
}

/**
 * Exit codes, kept apart from the verdict so a caller can log first and exit
 * last. 3 rather than 1 for "measured off": a CI step must be able to tell
 * "PITR is not bought" from "the check itself broke", and 1 is what every
 * crash already uses.
 */
export const EXIT = {
  ENABLED: 0,
  CANNOT_MEASURE: 2,
  DISABLED: 3,
}

export function exitCodeFor(verdict) {
  if (verdict.enabled === true) return EXIT.ENABLED
  if (verdict.enabled === false) return EXIT.DISABLED
  return EXIT.CANNOT_MEASURE
}
