// scripts/seed/lib/cli.mjs
//
// Argument parsing, and the one rule that shapes it: the connection string is
// a parameter, never an environment variable.
//
// WHY NOT process.env.DATABASE_URL
//
// Reading the URL from the environment is how a seed ends up running against
// production. The developer exports DATABASE_URL for a migration, opens a new
// task, runs the seed, and the seed silently inherits whatever was last
// exported. Nothing in the command line records which database was written, so
// neither the shell history nor a CI log can be audited afterwards.
//
// Requiring --database-url makes the target appear in the command that ran, in
// the shell history, and in any CI transcript. lib/guard.mjs then decides
// whether that target may be written to at all.

import { readFileSync } from 'node:fs'

export const USAGE = `
Usage:
  node scripts/seed/seed.mjs --database-url=<postgres-url> [options]

Required:
  --database-url=<url>   Target Postgres connection string. Not read from the
                         environment: it must be given here, so the command
                         records which database was written.
                         --database-url-file=<path> reads it from a file instead,
                         which keeps the password out of the shell history.

Options:
  --dry-run              Introspect, build every row, print the plan, write
                         nothing. Rolls back even the transaction it opened.
  --allow-remote         Permit a non-local host. Refused without it. Never
                         lifts the production denylist, which cannot be lifted.
  --truncate             Delete previously seeded rows (those whose id is in the
                         seed's own UUID namespace) before writing. Rows the
                         seed did not create are never touched.
  --only=<steps>         Comma-separated subset of steps to run, e.g.
                         --only=categories,suppliers,products
  --seed=<string>        PRNG seed. Default "kenyonexpress". Same seed plus same
                         --now gives byte-identical output.
  --now=<iso>            Pin the run clock, e.g. --now=2026-07-29T09:00:00Z
  --products=<n>         How many catalog products to write. Default 100, which
                         is the full authored catalog. Lower values take a
                         prefix of it, keeping the category mix.
  --quiet                Only the summary.
  --help                 This text.
`.trimStart()

const KNOWN_FLAGS = new Set([
  'dry-run',
  'allow-remote',
  'truncate',
  'quiet',
  'help',
  'yes',
])
const KNOWN_OPTIONS = new Set([
  'database-url',
  'database-url-file',
  'only',
  'seed',
  'now',
  'products',
])

export class CliError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CliError'
  }
}

export function parseArgs(argv) {
  const flags = new Set()
  const options = new Map()

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      throw new CliError(`unexpected positional argument "${arg}"`)
    }
    const body = arg.slice(2)
    const eq = body.indexOf('=')

    if (eq === -1) {
      if (!KNOWN_FLAGS.has(body)) {
        // A known option written without its value is the likeliest typo here,
        // so say which one rather than the generic "unknown argument".
        if (KNOWN_OPTIONS.has(body)) throw new CliError(`--${body} needs a value: --${body}=<value>`)
        throw new CliError(`unknown argument "${arg}"`)
      }
      flags.add(body)
      continue
    }

    const name = body.slice(0, eq)
    const value = body.slice(eq + 1)
    if (!KNOWN_OPTIONS.has(name)) throw new CliError(`unknown option "--${name}"`)
    if (value === '') throw new CliError(`--${name} was given an empty value`)
    options.set(name, value)
  }

  if (flags.has('help')) return { help: true }

  const databaseUrl = resolveDatabaseUrl(options)

  const products = options.has('products') ? Number.parseInt(options.get('products'), 10) : 100
  if (!Number.isInteger(products) || products < 1) {
    throw new CliError(`--products must be a positive integer, got "${options.get('products')}"`)
  }

  return {
    help: false,
    databaseUrl,
    dryRun: flags.has('dry-run'),
    allowRemote: flags.has('allow-remote'),
    truncate: flags.has('truncate'),
    quiet: flags.has('quiet'),
    assumeYes: flags.has('yes'),
    only: options.has('only')
      ? options
          .get('only')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    seed: options.get('seed') ?? 'kenyonexpress',
    now: options.get('now') ?? null,
    products,
  }
}

function resolveDatabaseUrl(options) {
  const inline = options.get('database-url')
  const fromFile = options.get('database-url-file')

  if (inline && fromFile) {
    throw new CliError('pass either --database-url or --database-url-file, not both')
  }
  if (!inline && !fromFile) {
    throw new CliError(
      'missing --database-url. The seed does not read DATABASE_URL from the ' +
        'environment: the target must be named on the command line so the run is auditable.',
    )
  }

  const raw = inline ?? readFileSync(fromFile, 'utf8').trim()
  if (!raw) throw new CliError(`${fromFile} is empty`)
  return raw
}
