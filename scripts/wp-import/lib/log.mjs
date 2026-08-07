// Run logging: console output plus the wp_import.migration_log trail.
//
// Every operation the pipeline performs is recorded twice:
//   1. a JSONL line in wp_import/logs/<batch>.jsonl - always, dry run included.
//      This is the artifact you read when the DB was never touched.
//   2. a row in wp_import.migration_log - only when the run is applying.
//
// The JSONL mirror is what makes a dry run useful: the full plan, row by row,
// diffable against the next run.

import { randomUUID } from 'node:crypto'
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DRY_RUN, PATHS, RUN, ensureDirs } from '../config.mjs'

const LEVEL_COLORS = { info: '\x1b[36m', ok: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' }
const RESET = '\x1b[0m'

function stamp() {
  return new Date().toISOString().slice(11, 23)
}

export function say(level, message) {
  const color = LEVEL_COLORS[level] || ''
  process.stdout.write(`${color}[${stamp()}] ${level.padEnd(5)}${RESET} ${message}\n`)
}

export const info = (m) => say('info', m)
export const ok = (m) => say('ok', m)
export const warn = (m) => say('warn', m)
export const error = (m) => say('error', m)

/**
 * One pipeline run. Owns the batch id that ties every log row, id_map row and
 * validation report together.
 */
export class Run {
  constructor({ kind, batchId = null }) {
    ensureDirs()
    // A dry run still needs a batch id so its plan is groupable and diffable.
    // It is a local uuid, not an import_batches row, until --apply creates one.
    this.batchId = batchId || randomUUID()
    this.kind = kind
    this.dryRun = DRY_RUN
    this.startedAt = Date.now()
    this.logPath = resolve(PATHS.logs, `${this.batchId}.jsonl`)
    this.pending = []
    this.counts = {}
    writeFileSync(this.logPath, '', { flag: 'a' })
  }

  /** Bump a named counter; the run summary prints all of them. */
  count(key, by = 1) {
    this.counts[key] = (this.counts[key] || 0) + by
  }

  /**
   * Record one operation. Mirrors to JSONL immediately, buffers for the DB
   * flush. `action` is one of insert|update|noop|skip|fail|delete.
   */
  op({
    stage,
    entity,
    wpId,
    action,
    targetTable = null,
    targetId = null,
    before = null,
    after = null,
    errorCode = null,
    errorDetail = null,
    durationMs = null,
  }) {
    const row = {
      batch_id: this.batchId,
      stage,
      entity,
      wp_id: String(wpId),
      external_id: externalId(entity, wpId),
      target_table: targetTable,
      target_id: targetId,
      action,
      dry_run: this.dryRun,
      before_data: before,
      after_data: after,
      error_code: errorCode,
      error_detail: errorDetail,
      duration_ms: durationMs,
    }
    appendFileSync(this.logPath, `${JSON.stringify(row)}\n`)
    this.pending.push(row)
    this.count(`${stage}.${entity}.${action}`)
    if (RUN.verbose) {
      const target = targetTable ? ` -> ${targetTable}` : ''
      say(action === 'fail' ? 'error' : 'info', `${stage} ${entity}#${wpId} ${action}${target}`)
    }
    return row
  }

  /**
   * How many failures this run RECORDED rather than threw.
   *
   * `fail()` deliberately does not throw, so a bad row does not abandon the
   * other nine thousand. The cost of that choice is that somebody has to ask
   * this question at the end, and until 2026-07-29 nobody did: a run where
   * every single stage failed still printed "dry run complete" in green and
   * exited 0.
   */
  failureCount() {
    return Object.entries(this.counts)
      .filter(([key]) => key.endsWith('.fail'))
      .reduce((total, [, n]) => total + n, 0)
  }

  /** The stages that recorded at least one failure, for the exit message. */
  failedStages() {
    return Object.entries(this.counts)
      .filter(([key]) => key.endsWith('.fail'))
      .map(([key, n]) => `${key.replace(/\.fail$/, '')} (${n})`)
  }

  /** Convenience: record a failure and keep going. Never throws. */
  fail(stage, entity, wpId, errorCode, err) {
    return this.op({
      stage,
      entity,
      wpId,
      action: 'fail',
      errorCode,
      errorDetail: err instanceof Error ? err.message : String(err),
    })
  }

  /**
   * Push buffered rows to wp_import.migration_log. No-op in a dry run: the
   * JSONL mirror already has everything and the DB must stay untouched.
   */
  async flush(db) {
    if (this.pending.length === 0) return 0
    const batch = this.pending
    this.pending = []
    if (this.dryRun || !db) return 0
    // chunked so a huge run does not build one enormous request body
    let written = 0
    for (let i = 0; i < batch.length; i += 500) {
      const slice = batch.slice(i, i + 500)
      const { error: err } = await db.schema('wp_import').from('migration_log').insert(slice)
      if (err) throw new Error(`migration_log insert failed: ${err.message}`)
      written += slice.length
    }
    return written
  }

  summary() {
    const seconds = ((Date.now() - this.startedAt) / 1000).toFixed(1)
    const lines = Object.entries(this.counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, n]) => `    ${key.padEnd(38)} ${String(n).padStart(7)}`)
    return [
      '',
      `  batch ${this.batchId}  (${this.kind}, ${this.dryRun ? 'DRY RUN' : 'APPLIED'}, ${seconds}s)`,
      ...lines,
      `  log: ${this.logPath}`,
      '',
    ].join('\n')
  }
}

/**
 * The idempotency key. Every upsert in this pipeline keys on this string, and
 * it is stored in migration_log so a re-run can be proven to target the same
 * rows as the run before it.
 */
export function externalId(entity, wpId) {
  return `wp:${entity}:${wpId}`
}
