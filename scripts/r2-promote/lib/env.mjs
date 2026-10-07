// `.env.local` for a script that node runs outside Next.
//
// Next loads `.env.local` for the app; a script does not get it, and every
// earlier script in this repo that tried either shelled out to `source` or
// kept the quotes. The quotes are the trap: the file holds
// `SUPABASE_SECRET_KEY="sb_secret_..."` and a parser that returns the value
// with its quotes produces an `Invalid API key` twenty minutes later. So this
// is a minimal parser that does exactly the shell's job for the file's shape:
// `KEY=value`, optional `export`, optional single or double quotes, `#`
// comments, and nothing else (no interpolation, no multi-line).
//
// The process environment wins over the file, so `R2_BUCKET=x node run.mjs`
// still overrides whatever the file says, same as Next.

import { existsSync, readFileSync } from 'node:fs'

export function parseDotEnv(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    } else {
      // An unquoted value ends at the first ` #`, like a shell comment.
      const hash = value.indexOf(' #')
      if (hash !== -1) value = value.slice(0, hash).trim()
    }
    out[m[1]] = value
  }
  return out
}

/**
 * Merge `.env.local` under the live environment. Returns the merged object
 * and never mutates `process.env`; the caller passes the result around, so a
 * test can hand in any environment it likes.
 */
export function loadEnv({ file = '.env.local', env = process.env } = {}) {
  const fromFile = existsSync(file) ? parseDotEnv(readFileSync(file, 'utf8')) : {}
  return { ...fromFile, ...env }
}
