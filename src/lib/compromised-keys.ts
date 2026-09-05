/**
 * Typed re-export of `scripts/compromised-keys.mjs`.
 *
 * The data and the logic live in the `.mjs` so that BOTH callers can reach them
 * without a build step: `src/lib/env.ts` imports this, and
 * `scripts/deploy-preflight.mjs` imports the `.mjs` directly under bare node.
 * The same arrangement as `scripts/raw-value-scan.mjs`, and for the same reason
 * -- a rule with two consumers must have one implementation.
 *
 * Everything about WHY these keys are listed, and why they are stored as a
 * SHA-256 rather than as the key, is in that file.
 */

export type CompromisedKey = {
  /** SHA-256 of the exact secret value, lowercase hex. */
  sha256: string
  /** Enough to recognise it in a dashboard listing. Never the whole key. */
  prefix: string
  /** When and how it was exposed. */
  note: string
}

export type CompromisedFinding = { variable: string; key: CompromisedKey }

import * as impl from '../../scripts/compromised-keys.mjs'

export const COMPROMISED_KEYS: CompromisedKey[] = impl.COMPROMISED_KEYS
export const fingerprint: (value: string) => string = impl.fingerprint
export const findCompromised: (value: string | undefined | null) => CompromisedKey | null =
  impl.findCompromised
export const scanEnvironmentForCompromisedKeys: (
  source?: NodeJS.ProcessEnv,
) => CompromisedFinding[] = impl.scanEnvironmentForCompromisedKeys
export const compromisedKeyMessage: (finding: CompromisedFinding) => string =
  impl.compromisedKeyMessage
