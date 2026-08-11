#!/usr/bin/env node
/**
 * Fetches the QStash signing keys and writes them into `.env.local`.
 *
 * WHY THIS SCRIPT EXISTS. The obvious command - the one that was reached for
 * first - is a GET against `api.upstash.com/v2/qstash/config`. That endpoint
 * does not exist. Probed on 2026-08-11, with a well-formed Basic credential:
 *
 *     /v2/qstash/config     404      /v2/redis/databases  401
 *     /v2/qstash            404      /v2/teams            401
 *     /v2/qstash/keys       404
 *     /v2/qstash/quota      404
 *
 * The 401s are the control: those are real endpoints rejecting a bad key. The
 * 404s are paths that are not there. Upstash's management API exposes NO
 * QStash surface at all.
 *
 * The keys live on the QStash API itself instead:
 *
 *     GET https://qstash.upstash.io/v2/keys
 *     Authorization: Bearer $QSTASH_TOKEN
 *
 * That one answered 401 rather than 404, which is how we know it is the right
 * door and only the credential was wrong.
 *
 * WHAT THIS MEANS PRACTICALLY. Only ONE value has to be copied by hand, from
 * Upstash Console -> QStash -> Details: the token. Both signing keys are
 * derived from it by this script, so the two values most likely to be
 * transcribed wrongly never get typed.
 *
 * IT REFUSES RATHER THAN GUESSES. A token that does not authenticate leaves
 * `.env.local` untouched. Writing a placeholder would be worse than writing
 * nothing: `verifySignature` would then reject every inbound QStash request
 * with a signature error, which reads like a QStash outage rather than a
 * missing key.
 *
 *   node scripts/qstash-sync.mjs                 # reads QSTASH_TOKEN from .env.local
 *   QSTASH_TOKEN=eyJ... node scripts/qstash-sync.mjs
 *   node scripts/qstash-sync.mjs --print         # show, write nothing
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ENV_PATH = join(process.cwd(), '.env.local')
const KEYS_URL = 'https://qstash.upstash.io/v2/keys'
const PRINT_ONLY = process.argv.includes('--print')

/** Reads one key out of a dotenv file without pulling in a parser. */
function fromEnvFile(name) {
  let text
  try {
    text = readFileSync(ENV_PATH, 'utf8')
  } catch {
    return null
  }
  // Anchored to a line start so a commented-out copy never wins over the live
  // one, which is exactly how a stale value gets used for an afternoon.
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'))
  const value = match?.[1]?.trim()
  return value ? value : null
}

/**
 * Upserts a key in place, preserving the surrounding file. Appending blindly
 * would leave two definitions of the same variable, and which one wins depends
 * on the loader.
 */
function upsert(text, name, value) {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, line)
  return `${text.endsWith('\n') ? text : `${text}\n`}${line}\n`
}

async function main() {
  const token = process.env.QSTASH_TOKEN || fromEnvFile('QSTASH_TOKEN')

  if (!token) {
    console.error('QSTASH_TOKEN is not set, in the environment or in .env.local.')
    console.error('Upstash Console -> QStash -> Details -> QSTASH_TOKEN')
    process.exit(2)
  }

  // A QStash token is a base64 JSON blob and starts `eyJ`. A UUID here is the
  // mistake that started this: it is some other Upstash field, and the API
  // answers 401 without saying which.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(token)) {
    console.error('That value is a UUID, and a QStash token is a long base64 string (eyJ...).')
    console.error('It is probably a different field from the Upstash console.')
    process.exit(2)
  }

  let response
  try {
    response = await fetch(KEYS_URL, { headers: { Authorization: `Bearer ${token}` } })
  } catch (error) {
    console.error(`Could not reach QStash: ${error.message}`)
    process.exit(1)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(`QStash refused the token: HTTP ${response.status} ${body.slice(0, 200)}`)
    console.error('Nothing was written. A placeholder here would make every inbound')
    console.error('QStash request fail signature verification, which looks like an outage.')
    process.exit(1)
  }

  const keys = await response.json()
  const current = keys?.current
  const next = keys?.next
  if (!current || !next) {
    console.error(`QStash answered 200 with no keys in it: ${JSON.stringify(keys).slice(0, 200)}`)
    process.exit(1)
  }

  console.log(`QSTASH_CURRENT_SIGNING_KEY=${current}`)
  console.log(`QSTASH_NEXT_SIGNING_KEY=${next}`)

  if (PRINT_ONLY) return

  let text = readFileSync(ENV_PATH, 'utf8')
  text = upsert(text, 'QSTASH_TOKEN', token)
  text = upsert(text, 'QSTASH_CURRENT_SIGNING_KEY', current)
  text = upsert(text, 'QSTASH_NEXT_SIGNING_KEY', next)
  writeFileSync(ENV_PATH, text)
  console.log(`\nWrote all three into ${ENV_PATH}`)

  // Printed rather than run. `vercel env add` reads the value from stdin and
  // needs an authenticated CLI; doing it silently from a script is how a
  // secret ends up in the wrong project or the wrong environment.
  console.log('\nFor Vercel, run these and paste each value when prompted:')
  for (const name of ['QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY']) {
    console.log(`  vercel env add ${name} production`)
  }
}

main()
