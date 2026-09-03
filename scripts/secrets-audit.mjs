#!/usr/bin/env node
/**
 * Working-tree and (optional) client-bundle secrets audit.
 *
 * Tree scan: git ls-files. Looks for private keys, live tokens, service-role
 * JWTs, postgres URLs with a password, and assigned values of the secret env
 * names. Names in source are allowed. Values are not.
 *
 * Bundle scan: if .next/static exists, grep the env NAMES. A name in the
 * client graph means a server secret was imported into a client module.
 *
 * Exit: 0 clean, 1 findings, 2 git ls-files failed.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const SECRET_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'CARDCOM_API_PASSWORD',
  'CARDCOM_WEBHOOK_SECRET',
  'VOUCHER_QR_SECRET',
  'R2_SECRET_ACCESS_KEY',
  'MEILISEARCH_API_KEY',
  'CRON_SECRET',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
]

export const PLACEHOLDER_VALUE =
  /^(?:|your-.*|\.{3}|xxx+|changeme|replace-me|sb_secret_\.{3}|https:\/\/your-project\.supabase\.co)$/i

export function isPlaceholder(value) {
  const v = value.replace(/^['"]|['"]$/g, '')
  if (PLACEHOLDER_VALUE.test(v)) return true
  if (/^<.*>$/.test(v)) return true
  if (v.includes('...')) return true
  if (/never-commit/i.test(v)) return true
  return false
}

function isTestPath(file) {
  return (
    /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(file) ||
    file.includes('__tests__/') ||
    file.startsWith('e2e/')
  )
}

function shouldSkipPath(file) {
  if (file.endsWith('.example')) return true
  // STATE.md records historical command output and is not a secrets store.
  if (file === 'STATE.md') return true
  return false
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

export function decodeJwtPayload(token) {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0].startsWith('eyJ') || !parts[1]) return null
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    )
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function findingsInText(file, text) {
  const hits = []
  const testPath = isTestPath(file)

  if (!testPath && /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(text)) {
    hits.push(`${file}: private key block`)
  }
  if (/\bsk_live_[0-9a-zA-Z]{20,}/.test(text)) {
    hits.push(`${file}: Stripe-shaped live secret`)
  }
  if (/\bghp_[A-Za-z0-9]{20,}/.test(text) || /\bgithub_pat_[A-Za-z0-9_]{20,}/.test(text)) {
    hits.push(`${file}: GitHub token`)
  }
  if (/\bAKIA[0-9A-Z]{16}\b/.test(text)) {
    hits.push(`${file}: AWS access key id`)
  }

  const jwtRe = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
  let jwtMatch = jwtRe.exec(text)
  while (jwtMatch) {
    const payload = decodeJwtPayload(jwtMatch[0])
    if (payload?.role === 'service_role' && payload.iss !== 'supabase-demo') {
      hits.push(`${file}: service_role JWT (iss=${String(payload.iss)})`)
    }
    jwtMatch = jwtRe.exec(text)
  }

  const urlRe = /\b(?:postgres|postgresql):\/\/([^:@/]+):([^@/]+)@/gi
  let urlMatch = urlRe.exec(text)
  while (urlMatch) {
    const password = urlMatch[2]
    if (password && !isPlaceholder(password) && password !== 'postgres') {
      hits.push(`${file}: postgres URL with a password`)
    }
    urlMatch = urlRe.exec(text)
  }

  if (!testPath) {
    for (const name of SECRET_ENV_NAMES) {
      const assigned = new RegExp(`${name}\\s*=\\s*([^\\s#]+)`)
      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        if (/^\s*(\/\/|#)/.test(line)) continue
        const assignedMatch = assigned.exec(line)
        if (!assignedMatch) continue
        const value = assignedMatch[1].replace(/^['"]|['"]$/g, '')
        if (!isPlaceholder(value) && value.length >= 8) {
          hits.push(`${file}: ${name} has a non-placeholder value`)
        }
      }
    }
  }

  if (!testPath && !file.endsWith('.example')) {
    const sbSecret = /\bsb_secret_[A-Za-z0-9]{20,}/g
    let sbMatch = sbSecret.exec(text)
    while (sbMatch) {
      hits.push(`${file}: sb_secret_ live-shaped key`)
      sbMatch = sbSecret.exec(text)
    }
  }

  return hits
}

export function scanTrackedFiles(files, readFile) {
  const read = readFile ?? ((file) => readFileSync(file, 'utf8'))
  const hits = []
  for (const file of files) {
    if (shouldSkipPath(file)) continue
    let text
    try {
      text = read(file)
    } catch {
      continue
    }
    hits.push(...findingsInText(file, text))
  }
  return hits
}

export function scanClientBundle(staticDir = '.next/static') {
  const hits = []
  if (!existsSync(staticDir)) return { skipped: true, hits }
  for (const file of walk(staticDir)) {
    if (!/\.(js|json|html|txt|map)$/.test(file)) continue
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const name of SECRET_ENV_NAMES) {
      if (text.includes(name)) hits.push(`${file}: client bundle contains ${name}`)
    }
  }
  return { skipped: false, hits }
}

export function listTrackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

function main() {
  let files
  try {
    files = listTrackedFiles()
  } catch (err) {
    console.error(err.message)
    process.exit(2)
  }
  const treeHits = scanTrackedFiles(files)
  const bundle = process.argv.includes('--bundle')
    ? scanClientBundle()
    : { skipped: true, hits: [] }

  if (treeHits.length === 0) console.log('secrets-audit: working tree clean')
  else for (const hit of treeHits) console.error(hit)

  if (bundle.skipped && process.argv.includes('--bundle')) {
    console.error('secrets-audit: .next/static missing (build first) ')
    process.exit(2)
  }
  if (!bundle.skipped && bundle.hits.length === 0) {
    console.log('secrets-audit: client bundle clean')
  }
  for (const hit of bundle.hits) console.error(hit)

  if (treeHits.length || bundle.hits.length) process.exit(1)
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)

if (isMain) main()
