#!/usr/bin/env node
/**
 * Blue-green promotion: a deployment that already exists (the green) is
 * smoke-tested on its own URL, promoted to the production domain, smoke-tested
 * again THERE, and rolled back to the previous deployment (the blue) if the
 * second smoke fails.
 *
 *   node scripts/deploy/promote.mjs --deployment dpl_x|host [--dry] [--skip-preview-smoke]
 *
 * Why two smokes. The preview URL proves the build; the production URL proves
 * the build behind the production domain, its env, its edge config and its
 * crons. Those diverge (a preview has no cron schedule and a different
 * VERCEL_URL), and the second one is the one customers hit.
 *
 * Exit 0 promoted and verified, 1 preview rejected (production untouched),
 * 2 not configured, 4 promoted then rolled back, 5 promoted, smoke failed,
 * rollback also failed (a human is needed now).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decideAfterPromote,
  formatDeployIncident,
  incidentPriority,
  pickRollbackTarget,
  redactSecrets,
} from './lib.mjs'
import { notify } from './notify.mjs'
import { performRollback } from './rollback.mjs'
import { runSmoke } from './smoke.mjs'
import {
  currentProductionId,
  deploymentSha,
  deploymentUrl,
  getDeployment,
  getProject,
  listProductionDeployments,
  promoteDeployment,
  vercelConfig,
} from './vercel.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REGISTRY = join(HERE, '..', 'cron-jobs.json')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    out[key] = inline ?? (argv[i + 1]?.startsWith('--') ? 'true' : (argv[++i] ?? 'true'))
  }
  return out
}

export async function performPromote({
  config,
  deploymentRef,
  dry = false,
  skipPreviewSmoke = false,
  productionBase,
  bypass,
  jobs,
  runUrl,
  fetchImpl = fetch,
  env = process.env,
  log = () => {},
}) {
  const deployment = await getDeployment(config, deploymentRef, { fetchImpl })
  const greenId = deployment.id ?? deployment.uid
  const greenUrl = deploymentUrl(deployment)
  const sha = deploymentSha(deployment)
  const state = deployment.readyState ?? deployment.state
  log(`promote: green ${greenId} ${greenUrl} (${sha?.slice(0, 7) ?? 'no sha'}) state=${state}`)
  if (state !== 'READY') {
    log(`promote: deployment is ${state}, not READY; refusing`)
    return { ok: false, code: 1, stage: 'not-ready' }
  }

  const project = await getProject(config, { fetchImpl })
  const blueId = currentProductionId(project)
  log(`promote: blue (current production) ${blueId ?? 'none'}`)
  if (blueId === greenId) {
    log('promote: that deployment is already production; nothing to do')
    return { ok: true, code: 0, stage: 'already-production' }
  }

  // 1. The green must pass on its own URL before it touches the domain.
  if (!skipPreviewSmoke) {
    const preview = await runSmoke({ base: greenUrl, bypass, jobs, fetchImpl, log })
    if (!preview.ok) {
      const text = formatDeployIncident({
        kind: 'preview-rejected',
        environment: 'preview',
        url: greenUrl,
        deploymentId: greenId,
        sha,
        failures: preview.failures,
        runUrl,
      })
      if (!dry)
        await notify({
          title: text.split('\n')[0],
          text,
          priority: incidentPriority('preview-rejected'),
          env,
          fetchImpl,
        })
      return { ok: false, code: 1, stage: 'preview-smoke', smoke: preview }
    }
  }

  if (dry) {
    const deployments = await listProductionDeployments(config, { fetchImpl })
    const target = pickRollbackTarget(deployments, greenId)
    log(
      `promote: --dry, would promote ${greenId}; rollback target would be ${target?.uid ?? target?.id ?? 'none'}`,
    )
    return { ok: true, code: 0, stage: 'dry', dry: true }
  }

  // 2. Switch the domain.
  try {
    await promoteDeployment(config, greenId, { fetchImpl })
  } catch (error) {
    log(redactSecrets(`promote: endpoint refused: ${error.message}`))
    return { ok: false, code: 1, stage: 'promote-call', error: error.message }
  }
  log(`promote: ${greenId} is now behind ${productionBase}`)

  // 3. The smoke that matters, on the production domain.
  const production = await runSmoke({ base: productionBase, bypass, jobs, fetchImpl, log })
  if (production.ok) {
    const text = formatDeployIncident({
      kind: 'promoted',
      url: productionBase,
      deploymentId: greenId,
      sha,
      runUrl,
    })
    await notify({
      title: text.split('\n')[0],
      text,
      priority: incidentPriority('promoted'),
      env,
      fetchImpl,
    })
    return { ok: true, code: 0, stage: 'promoted', smoke: production }
  }

  // 4. Blue back in front. `exclude` carries the green so the picker cannot
  // choose the deployment that just failed.
  const deployments = await listProductionDeployments(config, { fetchImpl })
  const target = pickRollbackTarget(deployments, greenId, [greenId])
  const decision = decideAfterPromote({ smoke: production, target })
  if (decision.action === 'alert-only') {
    const text = formatDeployIncident({
      kind: 'no-rollback-target',
      url: productionBase,
      deploymentId: greenId,
      sha,
      failures: production.failures,
      runUrl,
    })
    await notify({
      title: text.split('\n')[0],
      text,
      priority: incidentPriority('no-rollback-target'),
      env,
      fetchImpl,
    })
    return { ok: false, code: 5, stage: 'no-rollback-target', smoke: production }
  }
  const rolled = await performRollback({
    config,
    currentId: greenId,
    exclude: [greenId],
    productionBase,
    bypass,
    jobs,
    runUrl,
    reason: `promotion of ${greenId} failed its production smoke`,
    fetchImpl,
    env,
    log,
  })
  return {
    ok: false,
    code: rolled.ok ? 4 : 5,
    stage: rolled.ok ? 'rolled-back' : 'rollback-failed',
    smoke: production,
    rolled,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const config = vercelConfig()
  if (!config) {
    console.error('promote: VERCEL_TOKEN is not set; nothing can be promoted from here')
    return 2
  }
  if (!args.deployment) {
    console.error('usage: promote.mjs --deployment dpl_x|host [--dry] [--skip-preview-smoke]')
    return 2
  }
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
  const productionBase = (process.env.PRODUCTION_URL || registry.defaultBaseUrl).replace(/\/+$/, '')
  const result = await performPromote({
    config,
    deploymentRef: args.deployment,
    dry: args.dry === 'true',
    skipPreviewSmoke: args['skip-preview-smoke'] === 'true',
    productionBase,
    bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    jobs: registry.jobs,
    runUrl: process.env.GITHUB_RUN_URL,
    log: console.log,
  })
  console.log(`promote: ${result.stage} (exit ${result.code})`)
  return result.code
}

if (process.argv[1]?.endsWith('promote.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
