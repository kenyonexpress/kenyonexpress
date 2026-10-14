#!/usr/bin/env node
/**
 * One Supabase preview branch per pull request, over the management API.
 *
 * Why the API and not the Supabase GitHub integration: the integration runs
 * `supabase/migrations` against a fresh branch, and on this project that
 * directory does not describe production (docs/MIGRATION-REVIEW.md, the
 * pre-059 lineage). A branch built from it would be a database the app has
 * never seen. `with_data: true` clones the parent instead, schema AND rows,
 * which is the only branch shape that reproduces the storefront. Production
 * holds no customer orders (docs/INDEX.md, "No customer has ever bought
 * anything"), so the rows cloned are catalogue and fixtures; the flag is still
 * a switch (PREVIEW_SUPABASE_WITH_DATA=false) for the day that stops being true.
 *
 * Measured 2026-10-14 against org `izakjexsygwjsueamxuq` (plan: pro):
 * branching is enabled on `ixvwfbuvfxxsjiywhbbb`, the default branch is `main`
 * and a persistent `staging` branch (`sjojzzppqhjxvjlvnwdb`, with_data) exists.
 * Neither of those two may ever be deleted by this file; `teardown` refuses a
 * default or persistent branch by name, not by trust.
 *
 *   SUPABASE_ACCESS_TOKEN   personal access token (sbp_...), the only secret
 *   SUPABASE_PROJECT_REF    parent project, defaults to the measured ref
 *
 * Branch names are `pr-<number>`. The number is the only state: teardown finds
 * the branch by name on the closed event and needs nothing stored in between.
 */

export const API = 'https://api.supabase.com'
export const DEFAULT_PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'

/** Statuses the management API reports for a branch's preview project. */
export const HEALTHY = 'ACTIVE_HEALTHY'
export const TERMINAL_FAILURES = new Set([
  'INIT_FAILED',
  'INACTIVE',
  'REMOVED',
  'PAUSE_FAILED',
  'RESTORE_FAILED',
  'PAUSING',
])

export function supabaseConfig(env = process.env) {
  const token = env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!token) return null
  return {
    token,
    projectRef: env.SUPABASE_PROJECT_REF?.trim() || DEFAULT_PROJECT_REF,
  }
}

export function branchNameForPr(pr) {
  const n = Number(pr)
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`pull request number must be a positive integer, got ${pr}`)
  return `pr-${n}`
}

export function isPreviewBranchName(name) {
  return /^pr-\d+$/.test(String(name ?? ''))
}

export class SupabaseApiError extends Error {
  constructor(method, path, status, detail) {
    super(`${method} ${path} -> ${status}${detail ? `: ${detail}` : ''}`)
    this.name = 'SupabaseApiError'
    this.status = status
  }
}

/** Token in the header only, never in the URL, so an error that quotes the URL cannot leak it. */
export async function supabaseRequest(config, method, path, { body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const detail = json?.message ?? json?.error ?? text.slice(0, 200)
    throw new SupabaseApiError(method, path, res.status, detail)
  }
  return json
}

export async function listBranches(config, opts) {
  const json = await supabaseRequest(
    config,
    'GET',
    `/v1/projects/${config.projectRef}/branches`,
    opts,
  )
  return Array.isArray(json) ? json : []
}

export function findBranch(branches, name) {
  return branches.find((b) => b?.name === name) ?? null
}

export async function createBranch(config, { name, gitBranch, withData = true }, opts) {
  return supabaseRequest(config, 'POST', `/v1/projects/${config.projectRef}/branches`, {
    ...opts,
    body: {
      branch_name: name,
      ...(gitBranch ? { git_branch: gitBranch } : {}),
      persistent: false,
      with_data: Boolean(withData),
    },
  })
}

/** The detail record: `ref`, `status`, `db_host`. Also carries db_pass and jwt_secret; never log it whole. */
export async function getBranchDetail(config, idOrRef, opts) {
  return supabaseRequest(config, 'GET', `/v1/branches/${encodeURIComponent(idOrRef)}`, opts)
}

export async function deleteBranch(config, id, opts) {
  return supabaseRequest(config, 'DELETE', `/v1/branches/${encodeURIComponent(id)}`, opts)
}

export async function getApiKeys(config, ref, opts) {
  const json = await supabaseRequest(
    config,
    'GET',
    `/v1/projects/${encodeURIComponent(ref)}/api-keys?reveal=true`,
    opts,
  )
  return Array.isArray(json) ? json : []
}

/**
 * The two keys the app reads. New-format keys first (`sb_publishable_`,
 * `sb_secret_`: `src/lib/supabase/admin-key.ts` treats them as opaque and
 * valid), legacy `anon` / `service_role` JWTs as the fallback for a branch
 * that only has those enabled.
 */
export function pickKeys(keys) {
  const byType = (type) => keys.find((k) => k?.type === type && k?.api_key)?.api_key ?? null
  const byName = (name) => keys.find((k) => k?.name === name && k?.api_key)?.api_key ?? null
  const anon = byType('publishable') ?? byName('anon')
  const secret = byType('secret') ?? byName('service_role')
  if (!anon || !secret) {
    const seen = keys.map((k) => `${k?.name}/${k?.type}`).join(', ') || 'none'
    throw new Error(
      `branch api keys incomplete: need publishable+secret or anon+service_role, saw ${seen}`,
    )
  }
  return { anonKey: anon, secretKey: secret }
}

export function supabaseUrlForRef(ref) {
  if (!/^[a-z]{20}$/.test(String(ref))) throw new Error(`not a project ref: ${ref}`)
  return `https://${ref}.supabase.co`
}

/** What one poll result means for the loop. */
export function judgeBranchStatus(status) {
  if (status === HEALTHY) return 'ready'
  if (TERMINAL_FAILURES.has(status)) return 'failed'
  return 'wait'
}

export async function waitForHealthy(
  config,
  idOrRef,
  {
    timeoutMs = 15 * 60_000,
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
    const detail = await getBranchDetail(config, idOrRef, { fetchImpl })
    last = detail?.status ?? null
    const verdict = judgeBranchStatus(last)
    log(`branch ${idOrRef}: ${last}`)
    if (verdict === 'ready') return detail
    if (verdict === 'failed')
      throw new Error(`branch ${idOrRef} reached ${last}, which does not recover`)
    await sleep(intervalMs)
  }
  throw new Error(
    `branch ${idOrRef} was still ${last ?? 'unknown'} after ${Math.round(timeoutMs / 60_000)} minutes`,
  )
}

/**
 * Find or create the branch for a pull request and return everything the
 * Vercel side needs. Idempotent: a second run on the same PR (synchronize)
 * reuses the branch, so pushes to the PR do not reset its data.
 */
export async function ensurePreviewBranch(config, { pr, gitBranch, withData = true }, opts = {}) {
  const name = branchNameForPr(pr)
  const branches = await listBranches(config, opts)
  let branch = findBranch(branches, name)
  let created = false
  if (!branch) {
    branch = await createBranch(config, { name, gitBranch, withData }, opts)
    created = true
  }
  const detail = await waitForHealthy(config, branch.id, opts)
  const ref = detail?.ref ?? branch.project_ref
  const keys = pickKeys(await getApiKeys(config, ref, opts))
  return {
    id: branch.id,
    name,
    ref,
    url: supabaseUrlForRef(ref),
    status: detail.status,
    withData: Boolean(branch.with_data ?? withData),
    created,
    ...keys,
  }
}

/** Why a branch must not be deleted, or null when it may. */
export function deletionRefusal(branch) {
  if (!branch) return null
  if (branch.is_default) return 'is the default branch'
  if (branch.persistent) return 'is persistent'
  if (!isPreviewBranchName(branch.name)) return `is not named pr-<n> (${branch.name})`
  return null
}

export async function teardownPreviewBranch(config, { pr }, opts = {}) {
  const name = branchNameForPr(pr)
  const branch = findBranch(await listBranches(config, opts), name)
  if (!branch) return { name, deleted: false, reason: 'absent' }
  const refusal = deletionRefusal(branch)
  if (refusal) throw new Error(`refusing to delete branch ${branch.name}: it ${refusal}`)
  await deleteBranch(config, branch.id, opts)
  return { name, deleted: true, id: branch.id, ref: branch.project_ref }
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

/** GitHub Actions output lines; secrets are masked before they are written. */
export function githubOutputs(result) {
  return {
    supabase_branch: result.name,
    supabase_ref: result.ref,
    supabase_url: result.url,
    supabase_status: result.status,
    supabase_created: String(result.created),
    supabase_with_data: String(result.withData),
  }
}

async function main(argv, env) {
  const { command, flags } = parseArgs(argv)
  const config = supabaseConfig(env)
  if (!config) {
    console.log(
      '::warning title=Supabase preview branch skipped::SUPABASE_ACCESS_TOKEN is not set.',
    )
    return 0
  }
  const { appendFileSync } = await import('node:fs')
  const out = (k, v) => {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`)
    else console.log(`${k}=${v}`)
  }
  if (command === 'ensure') {
    const withData = String(env.PREVIEW_SUPABASE_WITH_DATA ?? 'true').toLowerCase() !== 'false'
    const result = await ensurePreviewBranch(
      config,
      {
        pr: flags.pr,
        gitBranch: typeof flags['git-branch'] === 'string' ? flags['git-branch'] : undefined,
        withData,
      },
      { log: (m) => console.log(m) },
    )
    console.log(`::add-mask::${result.anonKey}`)
    console.log(`::add-mask::${result.secretKey}`)
    for (const [k, v] of Object.entries(githubOutputs(result))) out(k, v)
    out('supabase_anon_key', result.anonKey)
    out('supabase_secret_key', result.secretKey)
    console.log(
      `Supabase branch ${result.name} (${result.ref}) is ${result.status}${result.created ? ', created now' : ', reused'}`,
    )
    return 0
  }
  if (command === 'teardown') {
    const result = await teardownPreviewBranch(config, { pr: flags.pr })
    out('supabase_branch', result.name)
    out('supabase_deleted', String(result.deleted))
    console.log(
      result.deleted
        ? `deleted Supabase branch ${result.name} (${result.ref})`
        : `no Supabase branch ${result.name} to delete`,
    )
    return 0
  }
  console.error(
    'usage: supabase-branch.mjs ensure --pr <n> [--git-branch <name>] | teardown --pr <n>',
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
      console.error(`::error title=Supabase preview branch::${err.message}`)
      process.exit(1)
    },
  )
}
