#!/usr/bin/env node
/**
 * Does a secret VALUE, or a P0 secret's NAME, appear in the client bundle?
 *
 * docs/INFRA-TASKS.md task 10. The checklist's own "leak check" (section 3)
 * was a heading with no command under it, and `src/lib/env.ts`'s guard
 * (lines 99-107) only blocks a `NEXT_PUBLIC_`-prefixed name that LOOKS like
 * a secret -- it cannot see a value that reached a public chunk through a
 * client component literal or a serialized env object, and it runs at boot,
 * after the deployment already shipped. This is the build-time gate that
 * scans the artifact itself, before it is served to a browser.
 *
 *   pnpm build && node scripts/secret-leak-gate.mjs
 *
 * Reads .next/static/ from the LAST `pnpm build` -- like scripts/bundle-gate.mjs,
 * this deliberately does not build, so the gate measures the artifact you
 * are about to ship.
 *
 * THE CANDIDATE LIST IS DERIVED FROM process.env AT SCAN TIME, NOT FROM
 * GREPPING SOURCE. A prior audit found 96 of 129 env vars by grepping for
 * `process.env.X`, because `loadCardcomEnv` and its siblings read `env.X` off
 * a `ProcessEnv` object passed in as a parameter -- a pattern no source grep
 * for `process.env` sees. Scanning `process.env`'s own keys at runtime is
 * blind to that indirection.
 *
 * SCOPE: `.next/static/` only. `.next/server/` legitimately holds every
 * server secret in scope for a server bundle; scanning it would flag every
 * one of them as a false "leak" and the report would be too noisy to read.
 *
 * NEVER PRINTS A VALUE. Only the variable name, in every message this script
 * produces -- the report is itself something that could be pasted into an
 * issue or a chat.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const STATIC_DIR = '.next/static'
const NAME_PATTERN = /(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY|TOKEN)/i
const MIN_VALUE_LENGTH = 8 // "true", "false", a single digit: too short to mean anything found

// Text extensions actually shipped to a browser from this directory. Source
// maps (.map) are deliberately included: a leaked value undisturbed by
// minification is exactly as public in one as in the .js it maps.
const TEXT_EXTENSIONS = new Set(['.js', '.css', '.map', '.json', '.txt'])

/**
 * Every env var name that looks like a secret and is not meant to be public.
 *
 * @param {NodeJS.ProcessEnv} env
 */
export function secretCandidates(env) {
  return Object.entries(env)
    .filter(([name, value]) => {
      if (name.startsWith('NEXT_PUBLIC_')) return false
      if (!NAME_PATTERN.test(name)) return false
      return typeof value === 'string' && value.length >= MIN_VALUE_LENGTH
    })
    .map(([name, value]) => ({ name, value: /** @type {string} */ (value) }))
}

/**
 * The P0 secrets from docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md section 3
 * (ENV2, ENV3, ENV5, ENV6) whose NAME appearing in a public chunk is itself
 * a finding, independent of whether this scan's own process.env carries a
 * real value for it right now (a local/CI run often has these unset or
 * stubbed). A serialized env object carries names alongside values, so the
 * name is the signal a value-only scan would miss entirely on a machine
 * where the real secret was never present to match against.
 */
export const P0_SECRET_NAMES = [
  'SUPABASE_SECRET_KEY',
  'CARDCOM_TERMINAL_NUMBER',
  'CARDCOM_API_NAME',
  'CARDCOM_API_PASSWORD',
  'CARDCOM_WEBHOOK_SECRET',
  'CRON_SECRET',
  'VOUCHER_QR_SECRET',
]

function walk(dir) {
  /** @type {string[]} */
  const files = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

/**
 * @param {string[]} files
 * @param {{name: string, value: string}[]} candidates
 * @param {string[]} p0Names
 */
export function scan(files, candidates, p0Names) {
  /** @type {{file: string, name: string, kind: 'value' | 'name'}[]} */
  const findings = []
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue // a binary file (a font, an image) under .next/static -- not scanned
    }
    for (const { name, value } of candidates) {
      if (text.includes(value)) findings.push({ file, name, kind: 'value' })
    }
    for (const name of p0Names) {
      if (text.includes(name)) findings.push({ file, name, kind: 'name' })
    }
  }
  return findings
}

/**
 * The whole run, parametrized on the directory so
 * secret-leak-gate.test.mjs can point it at a fixture instead of a real
 * `.next/static` -- no real secret ever needs to exist for this to be
 * exercised end to end, including the exit-2 and exit-0 paths.
 *
 * @param {string} staticDir
 * @param {NodeJS.ProcessEnv} env
 */
export function run(staticDir, env) {
  let allFiles
  try {
    allFiles = readdirSync(staticDir)
  } catch {
    console.error(`secret-leak-gate: ${staticDir} missing -- run pnpm build first`)
    return 2
  }
  if (allFiles.length === 0) {
    console.error(`secret-leak-gate: ${staticDir} is empty -- run pnpm build first`)
    return 2
  }

  const files = walk(staticDir).filter((f) => {
    const dot = f.lastIndexOf('.')
    return dot !== -1 && TEXT_EXTENSIONS.has(f.slice(dot))
  })

  const candidates = secretCandidates(env)
  console.log(
    `secret-leak-gate: scanning ${files.length} text file(s) under ${staticDir} against ${candidates.length} env-derived candidate(s) and ${P0_SECRET_NAMES.length} P0 name(s)`,
  )

  const findings = scan(files, candidates, P0_SECRET_NAMES)

  if (findings.length === 0) {
    console.log(
      'secret-leak-gate: clean -- no candidate value or P0 secret name found in the client bundle',
    )
    return 0
  }

  console.error(
    `secret-leak-gate: ${findings.length} finding(s) -- values are never printed, names only:`,
  )
  for (const f of findings) {
    console.error(`  ${f.kind === 'value' ? 'VALUE' : 'NAME '} of ${f.name} found in ${f.file}`)
  }
  return 1
}

if (process.argv[1]?.endsWith('secret-leak-gate.mjs')) {
  process.exitCode = run(STATIC_DIR, process.env)
}
