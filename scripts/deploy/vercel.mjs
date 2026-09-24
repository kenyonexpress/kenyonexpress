/**
 * The four Vercel REST calls the pipeline needs, over plain fetch.
 *
 * No SDK and no CLI on purpose: the CLI needs a project link on disk and this
 * runs on a stateless runner; the SDK is a dependency for four URLs. Every
 * call takes its credentials from the env the workflow passes and nothing is
 * read from `.vercel/`.
 *
 *   VERCEL_TOKEN       personal or team token with deployments:write
 *   VERCEL_ORG_ID      the team id (team_...), which Vercel calls teamId
 *   VERCEL_PROJECT_ID  prj_...
 *
 * Measured 2026-09-17 through the Vercel MCP: team
 * `team_TUMTPVDP8218QHwedSjmgJWl` (hobby), project `kenyonexpress-web`
 * `prj_oqr4NKtSaB2h3szrxnT0DknAv9Xk`. Those are ids, not secrets, and they are
 * the defaults so a dispatch with only VERCEL_TOKEN set does the right thing.
 */

export const DEFAULT_TEAM_ID = 'team_TUMTPVDP8218QHwedSjmgJWl'
export const DEFAULT_PROJECT_ID = 'prj_oqr4NKtSaB2h3szrxnT0DknAv9Xk'
export const API = 'https://api.vercel.com'

export function vercelConfig(env = process.env) {
  const token = env.VERCEL_TOKEN?.trim()
  if (!token) return null
  return {
    token,
    teamId: env.VERCEL_ORG_ID?.trim() || DEFAULT_TEAM_ID,
    projectId: env.VERCEL_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID,
  }
}

export class VercelApiError extends Error {
  constructor(method, path, status, detail) {
    super(`${method} ${path} -> ${status}${detail ? `: ${detail}` : ''}`)
    this.name = 'VercelApiError'
    this.status = status
  }
}

/**
 * One request. The token goes in the header only, never the query string, so
 * an error message that quotes the URL cannot leak it.
 */
export async function vercelRequest(config, method, path, { body, fetchImpl = fetch } = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${API}${path}${sep}teamId=${encodeURIComponent(config.teamId)}`
  const res = await fetchImpl(url, {
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
    const detail = json?.error?.message ?? json?.error?.code ?? text.slice(0, 200)
    throw new VercelApiError(method, path, res.status, detail)
  }
  return json
}

/** The project record; `targets.production.id` is what production serves NOW. */
export async function getProject(config, opts) {
  return vercelRequest(config, 'GET', `/v9/projects/${config.projectId}`, opts)
}

export function currentProductionId(project) {
  return project?.targets?.production?.id ?? null
}

/** READY production deployments, newest first, capped at 20. */
export async function listProductionDeployments(config, opts) {
  const json = await vercelRequest(
    config,
    'GET',
    `/v6/deployments?projectId=${config.projectId}&target=production&state=READY&limit=20`,
    opts,
  )
  return json?.deployments ?? []
}

/** A deployment by id (`dpl_...`) or by host (`x-abc.vercel.app`). */
export async function getDeployment(config, idOrHost, opts) {
  const key = String(idOrHost)
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  return vercelRequest(config, 'GET', `/v13/deployments/${encodeURIComponent(key)}`, opts)
}

/**
 * Point every production domain at `deploymentId`. This is the green half of
 * blue-green: the deployment already exists and already passed its smoke; the
 * only thing that changes is which one the domain resolves to.
 */
export async function promoteDeployment(config, deploymentId, opts) {
  return vercelRequest(
    config,
    'POST',
    `/v10/projects/${config.projectId}/promote/${encodeURIComponent(deploymentId)}`,
    opts,
  )
}

/**
 * Instant rollback to a previous production deployment. Vercel's own
 * `vercel rollback` calls this same endpoint; it re-points the domains and
 * does not rebuild anything, which is why it takes seconds.
 */
export async function rollbackDeployment(config, deploymentId, opts) {
  return vercelRequest(
    config,
    'POST',
    `/v9/projects/${config.projectId}/rollback/${encodeURIComponent(deploymentId)}`,
    opts,
  )
}

/** The public https URL of a deployment record. */
export function deploymentUrl(deployment) {
  const host = deployment?.url ?? deployment?.alias?.[0]
  return host ? `https://${String(host).replace(/^https?:\/\//, '')}` : null
}

export function deploymentSha(deployment) {
  return deployment?.meta?.githubCommitSha ?? deployment?.meta?.gitCommitSha ?? null
}
