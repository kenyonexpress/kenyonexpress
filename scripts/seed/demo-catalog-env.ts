/**
 * Environment for the demo catalogue scripts, with two corrections.
 *
 * Values that read `[SENSITIVE]` are the agent harness's redaction
 * placeholders, not secrets (measured in this shell: SUPABASE_SERVICE_ROLE_KEY,
 * R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY all carried it).
 * Taken at face value they would pick the R2 sink on three placeholder names
 * and sign every upload with the word SENSITIVE. They are treated as unset.
 *
 * `.env.local` then fills in whatever the environment does not carry, the same
 * precedence `scripts/seed-test-data.mjs` uses.
 *
 * Its own module so `remove-demo-catalog.ts` can import it without importing
 * the seed script's entry point, which runs on import.
 */

import { readFileSync } from 'node:fs'

export const REDACTED = '[SENSITIVE]'

export type Env = Record<string, string | undefined>

export function loadEnv(
  processEnv: Record<string, string | undefined> = process.env,
  envFile = '.env.local',
): Env {
  const env: Env = {}
  for (const [key, value] of Object.entries(processEnv)) {
    if (value && value !== REDACTED) env[key] = value
  }
  try {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 1 || line.trimStart().startsWith('#')) continue
      const key = line.slice(0, eq).trim()
      const value = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
      if (!env[key] && value) env[key] = value
    }
  } catch {
    // No env file: the environment is expected to carry the values.
  }
  return env
}
