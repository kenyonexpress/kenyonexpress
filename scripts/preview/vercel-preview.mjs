#!/usr/bin/env node
/**
 * Point a pull request's Vercel preview at its own Supabase branch.
 *
 * The Vercel GitHub app already builds every pull request on project
 * `kenyonexpress-prod` and comments on the PR (measured on PR #72, 2026-10-14:
 * check "Vercel – kenyonexpress-prod", comment by `vercel[bot]`). What it builds
 * fails: the preview environment there carries only the public Supabase URL
 * and anon key, and `/account/referrals` prerenders through the admin client,
 * so every preview dies with "Missing SUPABASE_SECRET_KEY". Handing a preview
 * the PRODUCTION secret key would make it work and would also make a PR
 * browser into a production RLS bypass; this file does the other thing.
 *
 * Per pull request it:
 *   1. upserts the three Supabase variables as preview env scoped to the PR's
 *      git branch (Vercel's `gitBranch` field), so only that branch sees them;
 *   2. asks Vercel to deploy the PR head again through the git source, so the
 *      rebuild reads them (the push-triggered build already ran without them);
 *   3. waits for READY and assigns a stable alias, `<project>-pr-<n>.vercel.app`,
 *      which is the URL the PR comment shows and the URL that survives pushes.
 * On close it removes the branch-scoped variables and the alias.
 *
 *   VERCEL_TOKEN               deployments:write + env:write on the team
 *   VERCEL_ORG_ID              team id (defaults in scripts/deploy/vercel.mjs)
 *   VERCEL_PREVIEW_PROJECT_ID  the project whose previews the GitHub app builds
 */
import {
  VercelApiError,
  deploymentUrl,
  getDeployment,
  getProject,
  vercelConfig,
  vercelRequest,
} from '../deploy/vercel.mjs'

/** Measured 2026-10-14: the project the Vercel GitHub app builds PR previews on. */
export const DEFAULT_PREVIEW_PROJECT_ID = 'prj_keQjjnDoTb41AYmHy3ia59BKumyt'

export const PREVIEW_ENV_KEYS = Object.freeze([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
])

export function previewConfig(env = process.env) {
  const base = vercelConfig(env)
  if (!base) return null
  return {
    ...base,
    projectId: env.VERCEL_PREVIEW_PROJECT_ID?.trim() || DEFAULT_PREVIEW_PROJECT_ID,
  }
}

/**
 * The env records for one branch. The secret key is `encrypted`, which Vercel
 * stores but can be read back by a token with env:read; `sensitive` would hide
 * it from everyone including the teardown, which is fine, but also from the
 * person debugging a preview that cannot reach its database. Public keys are
 * plain because they are shipped to the browser anyway.
 */
export function branchEnvPayload({ gitBranch, url, anonKey, secretKey }) {
  if (!gitBranch) throw new Error('gitBranch is required')
  for (const [k, v] of Object.entries({ url, anonKey, secretKey })) {
    if (!v) throw new Error(`${k} is required`)
  }
  return [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', value: url, type: 'plain', target: ['preview'], gitBranch },
    {
      key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      value: anonKey,
      type: 'plain',
      target: ['preview'],
      gitBranch,
    },
    {
      key: 'SUPABASE_SECRET_KEY',
      value: secretKey,
      type: 'encrypted',
      target: ['preview'],
      gitBranch,
    },
  ]
}

export async function upsertBranchEnv(config, payload, opts) {
  return vercelRequest(config, 'POST', `/v10/projects/${config.projectId}/env?upsert=true`, {
    ...opts,
    body: payload,
  })
}

export async function listEnv(config, opts) {
  const json = await vercelRequest(config, 'GET', `/v10/projects/${config.projectId}/env`, opts)
  return json?.envs ?? []
}

/** Only records scoped to exactly this branch and one of our three keys. Never a project-wide one. */
export function selectBranchEnv(envs, gitBranch) {
  // An absent branch name must select nothing: project-wide records have no
  // gitBranch either, and `undefined === undefined` would have deleted the
  // production keys. The test for this case is the reason the guard exists.
  if (!gitBranch) return []
  return envs.filter((e) => e?.gitBranch === gitBranch && PREVIEW_ENV_KEYS.includes(e?.key))
}

export async function removeBranchEnv(config, gitBranch, opts) {
  const doomed = selectBranchEnv(await listEnv(config, opts), gitBranch)
  for (const e of doomed) {
    await vercelRequest(
      config,
      'DELETE',
      `/v9/projects/${config.projectId}/env/${encodeURIComponent(e.id)}`,
      opts,
    )
  }
  return doomed.map((e) => e.key)
}

/**
 * A new deployment of the PR head through the git source. `target` is omitted
 * on purpose: that is what makes it a preview and keeps it off the production
 * domains. Vercel resolves the branch-scoped env at build time, which is the
 * whole point of deploying again.
 */
export function redeployBody(project, { ref, sha, pr }) {
  const repoId = project?.link?.repoId
  if (!repoId)
    throw new Error(`project ${project?.name ?? '?'} has no git link; nothing to redeploy from`)
  return {
    name: project.name,
    project: project.id,
    gitSource: { type: 'github', repoId, ref, sha },
    meta: { kePreviewPr: String(pr), githubCommitRef: ref, githubCommitSha: sha },
  }
}

export async function redeployBranch(config, project, params, opts) {
  return vercelRequest(config, 'POST', '/v13/deployments?forceNew=1', {
    ...opts,
    body: redeployBody(project, params),
  })
}

export function judgeDeploymentState(state) {
  if (state === 'READY') return 'ready'
  if (state === 'ERROR' || state === 'CANCELED') return 'failed'
  return 'wait'
}

export async function waitForReady(
  config,
  deploymentId,
  {
    timeoutMs = 20 * 60_000,
    intervalMs = 15_000,
    sleep = defaultSleep,
    now = Date.now,
    log = () => {},
    fetchImpl,
  } = {},
) {
  const deadline = now() + timeoutMs
  let last = null
  while (now() < deadline) {
    const d = await getDeployment(config, deploymentId, { fetchImpl })
    last = d?.readyState ?? d?.state ?? null
    log(`deployment ${deploymentId}: ${last}`)
    const verdict = judgeDeploymentState(last)
    if (verdict === 'ready') return d
    if (verdict === 'failed') {
      const why = d?.errorMessage ? `: ${d.errorMessage}` : ''
      throw new Error(`deployment ${deploymentId} ended ${last}${why}`)
    }
    await sleep(intervalMs)
  }
  throw new Error(
    `deployment ${deploymentId} was still ${last ?? 'unknown'} after ${Math.round(timeoutMs / 60_000)} minutes`,
  )
}

/** `<project>-pr-<n>.vercel.app`; Vercel hostnames are lowercase and 63 chars max per label. */
export function stableAliasFor(projectName, pr) {
  const n = Number(pr)
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`pull request number must be a positive integer, got ${pr}`)
  const base = String(projectName)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
  const suffix = `-pr-${n}`
  return `${base.slice(0, 63 - suffix.length)}${suffix}.vercel.app`
}

export async function assignAlias(config, deploymentId, alias, opts) {
  return vercelRequest(
    config,
    'POST',
    `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`,
    {
      ...opts,
      body: { alias },
    },
  )
}

/** Remove the stable alias; a 404 means it was never assigned, which is not a failure. */
export async function removeAlias(config, alias, opts) {
  try {
    await vercelRequest(config, 'DELETE', `/v2/aliases/${encodeURIComponent(alias)}`, opts)
    return true
  } catch (err) {
    if (err instanceof VercelApiError && err.status === 404) return false
    throw err
  }
}

export async function wirePreview(
  config,
  { gitBranch, sha, pr, url, anonKey, secretKey },
  opts = {},
) {
  const project = await getProject(config, opts)
  await upsertBranchEnv(config, branchEnvPayload({ gitBranch, url, anonKey, secretKey }), opts)
  const created = await redeployBranch(config, project, { ref: gitBranch, sha, pr }, opts)
  const deployment = await waitForReady(config, created.id, opts)
  const alias = stableAliasFor(project.name, pr)
  await assignAlias(config, deployment.id, alias, opts)
  return {
    deploymentId: deployment.id,
    deploymentUrl: deploymentUrl(deployment),
    aliasUrl: `https://${alias}`,
    state: deployment.readyState ?? deployment.state,
    envKeys: PREVIEW_ENV_KEYS.slice(),
  }
}

export async function teardownPreview(config, { gitBranch, pr }, opts = {}) {
  if (!gitBranch)
    throw new Error('gitBranch is required for teardown; refusing to touch env without it')
  const project = await getProject(config, opts)
  const removedKeys = await removeBranchEnv(config, gitBranch, opts)
  const alias = stableAliasFor(project.name, pr)
  const aliasRemoved = await removeAlias(config, alias, opts)
  return { removedKeys, alias, aliasRemoved }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---- CLI ---------------------------------------------------------------------

export function parseArgs(argv) {
  const [command, ...rest] = argv
  const flags = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) flags[key] = true
    else {
      flags[key] = next
      i++
    }
  }
  return { command, flags }
}

async function main(argv, env) {
  const { command, flags } = parseArgs(argv)
  const config = previewConfig(env)
  if (!config) {
    console.log('::warning title=Vercel preview wiring skipped::VERCEL_TOKEN is not set.')
    return 0
  }
  const { appendFileSync } = await import('node:fs')
  const out = (k, v) => {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`)
    else console.log(`${k}=${v}`)
  }
  if (command === 'wire') {
    // The keys arrive through env, never argv: argv is visible to every
    // process on the runner and lands in the job log on `set -x`.
    const result = await wirePreview(
      config,
      {
        gitBranch: flags['git-branch'],
        sha: flags.sha,
        pr: flags.pr,
        url: env.PREVIEW_SUPABASE_URL,
        anonKey: env.PREVIEW_SUPABASE_ANON_KEY,
        secretKey: env.PREVIEW_SUPABASE_SECRET_KEY,
      },
      { log: (m) => console.log(m) },
    )
    out('preview_url', result.aliasUrl)
    out('deployment_url', result.deploymentUrl)
    out('deployment_id', result.deploymentId)
    out('deployment_state', result.state)
    console.log(`preview ready: ${result.aliasUrl} (${result.deploymentUrl})`)
    return 0
  }
  if (command === 'teardown') {
    const result = await teardownPreview(config, { gitBranch: flags['git-branch'], pr: flags.pr })
    out('removed_env_keys', result.removedKeys.join(','))
    out('alias_removed', String(result.aliasRemoved))
    console.log(
      `removed ${result.removedKeys.length} branch-scoped env records; alias ${result.alias} ${result.aliasRemoved ? 'removed' : 'was not assigned'}`,
    )
    return 0
  }
  console.error(
    'usage: vercel-preview.mjs wire --git-branch <b> --sha <sha> --pr <n> | teardown --git-branch <b> --pr <n>',
  )
  return 2
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`::error title=Vercel preview wiring::${err.message}`)
      process.exit(1)
    },
  )
}
