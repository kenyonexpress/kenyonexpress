#!/usr/bin/env node
/**
 * Post-deploy smoke: the question "is THIS deployment fit to serve?"
 *
 *   node scripts/deploy/smoke.mjs --base https://host [--bypass SECRET] [--json out.json]
 *
 * Probes the storefront pages, the health route (status AND body) and every
 * scheduled cron path from scripts/cron-jobs.json. The cron paths matter more
 * than they look: production-smoke.yml reported a healthy site for three days
 * while three scheduled routes 404ed in the same deployment, because it only
 * asked about `/` and `/api/health`.
 *
 * Exit 0 fit, 1 not fit, 2 misuse. Writes `smoke_ok`, `smoke_failures` and
 * `smoke_report` to $GITHUB_OUTPUT when that is set, so a workflow step can
 * branch on the verdict without parsing stdout.
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateSmoke, normalizeBase, probePlan } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REGISTRY = join(HERE, '..', 'cron-jobs.json')
const TIMEOUT_MS = 20_000

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

/** One GET, status plus the first 2KB of body. Never throws: 0 is "no answer". */
export async function probeUrl(url, { bypass, fetchImpl = fetch } = {}) {
  const headers = bypass ? { 'x-vercel-protection-bypass': bypass } : {}
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await res.text().catch(() => '')).slice(0, 2048)
    return { status: res.status, body }
  } catch {
    return { status: 0, body: '' }
  }
}

export async function runSmoke({ base, bypass, jobs, fetchImpl = fetch, log = () => {} }) {
  const plan = probePlan(jobs)
  const probes = []
  for (const step of plan) {
    const { status, body } = await probeUrl(`${base}${step.path}`, { bypass, fetchImpl })
    probes.push({ ...step, status, body })
  }
  const verdict = evaluateSmoke(probes)
  for (const r of verdict.results) {
    log(
      `  ${r.ok ? 'ok  ' : 'FAIL'} ${r.kind.padEnd(6)} ${r.path.padEnd(32)} ${r.status}${r.reason ? ` ${r.reason}` : ''}`,
    )
  }
  return verdict
}

function writeGithubOutput(verdict) {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  const failures = verdict.failures
    .map((f) => `- \`${f.path}\` -> ${f.status} (${f.reason})`)
    .join('\n')
  const report = verdict.results
    .map((r) => `| \`${r.path}\` | ${r.status} | ${r.ok ? 'ok' : r.reason} |`)
    .join('\n')
  appendFileSync(
    file,
    [
      `smoke_ok=${verdict.ok}`,
      'smoke_failures<<SMOKE_EOF',
      failures,
      'SMOKE_EOF',
      'smoke_report<<SMOKE_EOF',
      report,
      'SMOKE_EOF',
      '',
    ].join('\n'),
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const base = normalizeBase(args.base ?? process.env.SMOKE_BASE_URL ?? process.env.PRODUCTION_URL)
  if (!base) {
    console.error('usage: smoke.mjs --base https://host [--bypass SECRET] [--json out.json]')
    return 2
  }
  const bypass = args.bypass ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? undefined
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))
  console.log(
    `smoke: ${base} (${registry.jobs.length} cron paths, bypass ${bypass ? 'set' : 'unset'})`,
  )

  const verdict = await runSmoke({ base, bypass, jobs: registry.jobs, log: console.log })
  if (args.json) writeFileSync(args.json, JSON.stringify({ base, ...verdict }, null, 2))
  writeGithubOutput(verdict)

  if (verdict.ok) {
    console.log(`\nfit to serve: all ${verdict.results.length} probes passed`)
    return 0
  }
  console.log(
    `\nNOT fit to serve: ${verdict.failures.length} of ${verdict.results.length} probes failed`,
  )
  return 1
}

if (process.argv[1]?.endsWith('smoke.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
