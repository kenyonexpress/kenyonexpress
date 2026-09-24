#!/usr/bin/env node
/**
 * Auto-rollback: put the previous READY production deployment back in front
 * of the domain, verify it, and tell the phone.
 *
 *   node scripts/deploy/rollback.mjs [--current dpl_x] [--exclude dpl_y] [--dry] [--reason "..."]
 *
 * Who calls it: auto-rollback.yml after a production smoke fails, and
 * promote.mjs when the smoke that follows a promotion fails. Both already
 * decided that the current deployment is unfit; this script does not re-ask.
 *
 * `--dry` resolves the target and prints the plan without calling the rollback
 * endpoint. That is the mode CI runs on every push so the target resolution
 * is proven before the day it is needed.
 *
 * Exit 0 rolled back and verified, 1 rollback refused or the target failed
 * its own smoke, 2 not configured (no VERCEL_TOKEN), 3 no target.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatDeployIncident,
  incidentPriority,
  pickRollbackTarget,
  redactSecrets,
} from './lib.mjs'
import { notify } from './notify.mjs'
import { runSmoke } from './smoke.mjs'
import {
  currentProductionId,
  deploymentSha,
  deploymentUrl,
  getProject,
  listProductionDeployments,
  rollbackDeployment,
  vercelConfig,
} from './vercel.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REGISTRY = join(HERE, '..', 'cron-jobs.json')

function parseArgs(argv) {
  const out = { exclude: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    const value = inline ?? (argv[i + 1]?.startsWith('--') ? 'true' : (argv[++i] ?? 'true'))
    if (key === 'exclude') out.exclude.push(value)
    else out[key] = value
  }
  return out
}

/**
 * The whole procedure as one function, so promote.mjs can call it in-process
 * and the test can drive it with a fake fetch.
 */
export async function performRollback({
  config,
  currentId,
  exclude = [],
  dry = false,
  productionBase,
  bypass,
  jobs,
  runUrl,
  reason,
  fetchImpl = fetch,
  env = process.env,
  log = () => {},
}) {
  const project = await getProject(config, { fetchImpl })
  const serving = currentId ?? currentProductionId(project)
  const deployments = await listProductionDeployments(config, { fetchImpl })
  const target = pickRollbackTarget(deployments, serving, exclude)
  log(`rollback: production serves ${serving ?? '?'}; ${deployments.length} READY candidates`)

  if (!target) {
    const text = formatDeployIncident({
      kind: 'no-rollback-target',
      url: productionBase,
      deploymentId: serving,
      runUrl,
    })
    if (!dry)
      await notify({
        title: text.split('\n')[0],
        text,
        priority: incidentPriority('no-rollback-target'),
        env,
        fetchImpl,
      })
    return { ok: false, code: 3, target: null }
  }

  const targetId = target.uid ?? target.id
  log(
    `rollback: target ${targetId} (${deploymentUrl(target)}, ${deploymentSha(target)?.slice(0, 7) ?? 'no sha'})`,
  )
  if (dry) {
    log('rollback: --dry, not calling the rollback endpoint')
    return { ok: true, code: 0, target, dry: true }
  }

  try {
    await rollbackDeployment(config, targetId, { fetchImpl })
  } catch (error) {
    log(redactSecrets(`rollback: endpoint refused: ${error.message}`))
    const text = formatDeployIncident({
      kind: 'rollback-failed',
      url: productionBase,
      deploymentId: serving,
      rollbackTo: target,
      runUrl,
    })
    await notify({
      title: text.split('\n')[0],
      text,
      priority: incidentPriority('rollback-failed'),
      env,
      fetchImpl,
    })
    return { ok: false, code: 1, target }
  }

  // Verify the rollback did what it claims: the domain must now serve the
  // target, and the target must itself pass the smoke. A rollback to a
  // deployment that is also broken is reported as its own failure.
  let smoke = { ok: true, failures: [] }
  if (productionBase && jobs) {
    smoke = await runSmoke({ base: productionBase, bypass, jobs, fetchImpl, log })
  }
  const kind = smoke.ok ? 'rolled-back' : 'rollback-failed'
  const text = formatDeployIncident({
    kind,
    url: productionBase,
    deploymentId: serving,
    sha: deploymentSha(target),
    rollbackTo: target,
    failures: smoke.failures,
    runUrl,
  })
  await notify({
    title: text.split('\n')[0],
    text: reason ? `${text}\nסיבה: ${reason}` : text,
    priority: incidentPriority(kind),
    env,
    fetchImpl,
  })
  return { ok: smoke.ok, code: smoke.ok ? 0 : 1, target, smoke }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = vercelConfig()
  if (!config) {
    console.error('rollback: VERCEL_TOKEN is not set; nothing can be rolled back from here')
    return 2
  }
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
  const productionBase = (process.env.PRODUCTION_URL || registry.defaultBaseUrl).replace(/\/+$/, '')
  const result = await performRollback({
    config,
    currentId: args.current,
    exclude: args.exclude,
    dry: args.dry === 'true',
    productionBase,
    bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    jobs: registry.jobs,
    runUrl: process.env.GITHUB_RUN_URL,
    reason: args.reason,
    log: console.log,
  })
  return result.code
}

if (process.argv[1]?.endsWith('rollback.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
