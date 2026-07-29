#!/usr/bin/env node
// WordPress to Supabase migration: pipeline entry point.
//
//   node scripts/wp-import/run.mjs            # full dry run, writes nothing
//   node scripts/wp-import/run.mjs transform  # one stage
//   WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs load --apply
//
// See scripts/wp-import/README.md and docs/ARCHITECTURE-WP-DATA-MIGRATION.md.

import { extract } from './01-extract.mjs'
import { transform } from './02-transform.mjs'
import { loadStaging } from './03-load-staging.mjs'
import { projectPublic } from './04-project-public.mjs'
import { validate } from './05-validate.mjs'
import { mediaSync } from './06-media-sync.mjs'
import { DRY_RUN, HELP, PATHS, RUN, dryRunReason, ensureDirs } from './config.mjs'
import { Run, error, info, ok, warn } from './lib/log.mjs'

const STAGES = {
  extract: { kind: 'staging_load', fn: extract },
  transform: { kind: 'staging_load', fn: transform },
  load: { kind: 'staging_load', fn: loadStaging },
  media: { kind: 'media_sync', fn: mediaSync },
  project: { kind: 'project_catalog', fn: projectPublic },
  validate: { kind: 'verify', fn: validate },
}

// media before project: the projection writes image URLs into products.images
const ORDER = ['extract', 'transform', 'load', 'media', 'project', 'validate']

if (RUN.help) {
  process.stdout.write(HELP)
  process.exit(0)
}

const requested = RUN.stage === 'all' ? ORDER : [RUN.stage]
for (const stage of requested) {
  if (!STAGES[stage]) {
    error(`unknown stage "${stage}". One of: ${ORDER.join(', ')}, all`)
    process.stdout.write(HELP)
    process.exit(2)
  }
}

ensureDirs()

const banner = DRY_RUN
  ? `DRY RUN - nothing will be written (${dryRunReason()})`
  : 'APPLYING - both write locks are open, this run will modify the database'

info(`wp-import: ${requested.join(' -> ')}`)
if (DRY_RUN) info(banner)
else warn(banner)

const run = new Run({ kind: STAGES[requested[0]].kind, batchId: RUN.batchId })
let report = null
let failed = false

for (const stage of requested) {
  info('')
  info(`--- ${stage} ---`)
  try {
    const result = await STAGES[stage].fn(run)
    if (stage === 'validate') report = result
  } catch (err) {
    failed = true
    error(`${stage} failed: ${err.message}`)
    if (RUN.verbose && err.stack) process.stderr.write(`${err.stack}\n`)
    // A failed stage invalidates everything downstream: stopping here leaves a
    // diagnosable half-state instead of a confusing fully-attempted one.
    break
  }
}

process.stdout.write(run.summary())
info(`artifacts: ${PATHS.root}`)

if (failed) process.exit(1)
if (report && !report.passed) {
  error('validation gates failed: this migration must not go live')
  process.exit(1)
}
ok(DRY_RUN ? 'dry run complete' : 'run complete')
