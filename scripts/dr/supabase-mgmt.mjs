/**
 * Thin Supabase management-API client for the DR scripts. Stdlib only, like
 * r2.mjs, for the same reason: a backup watchdog must not depend on pnpm
 * install succeeding.
 *
 * Token sources, in order: SUPABASE_ACCESS_TOKEN in the environment (the
 * workflow secret), then, only when `allowKeychain` is set, the token the
 * Supabase CLI keeps in the macOS keychain (`security find-generic-password
 * -s "Supabase CLI"`, stored as `go-keyring-base64:<b64>`). The keychain path
 * exists so a laptop can run `pitr.mjs --status` without copying a personal
 * token anywhere; it is opt-in so CI can never accidentally reach for it.
 */

import { spawnSync } from 'node:child_process'

export const DEFAULT_PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'
export const API_BASE = 'https://api.supabase.com'

/** Decode the CLI keychain entry format. Exported for the unit test. */
export function decodeKeychainToken(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('go-keyring-base64:')) {
    return Buffer.from(s.slice('go-keyring-base64:'.length), 'base64').toString('utf8').trim()
  }
  return s
}

export function managementToken(env = process.env, { allowKeychain = false } = {}) {
  const fromEnv = env.SUPABASE_ACCESS_TOKEN?.trim()
  if (fromEnv) return fromEnv
  if (!allowKeychain || process.platform !== 'darwin') return null
  const r = spawnSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  })
  if (r.status !== 0) return null
  return decodeKeychainToken(r.stdout)
}

export function projectRef(env = process.env) {
  return env.SUPABASE_PROJECT_REF?.trim() || DEFAULT_PROJECT_REF
}

async function request(token, method, path, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg = json?.message ?? text.slice(0, 300)
    throw new Error(`${method} ${path} -> ${res.status}: ${msg}`)
  }
  return json
}

export const mgmtGet = (token, path, fetchImpl) => request(token, 'GET', path, undefined, fetchImpl)
export const mgmtPatch = (token, path, body, fetchImpl) =>
  request(token, 'PATCH', path, body, fetchImpl)

export const backupsPath = (ref) => `/v1/projects/${ref}/database/backups`
export const addonsPath = (ref) => `/v1/projects/${ref}/billing/addons`
