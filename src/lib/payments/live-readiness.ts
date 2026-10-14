import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Is the deployment holding REAL Cardcom credentials yet?
 *
 * WHY THIS IS A SCHEDULED CHECK AND NOT A BOOT CHECK. The launch sequence is:
 * Ofir pastes the live Cardcom credentials into Vercel, redeploys, and then
 * flips `CHECKOUT_ENABLED=true`. Between the paste and the flip the shop is
 * correctly closed (lib/payments/env.ts fails closed in production), and
 * nothing in the system says "the credentials are here, the flip is now the
 * only thing left". A check that runs on the schedule reads the variables the
 * running deployment actually has, every half hour, and says exactly that,
 * once per state, on the phone topic this project already uses.
 *
 * WHAT COUNTS AS LIVE. `CARDCOM_USE_MOCK` must be the literal `false`, and
 * `CARDCOM_API_NAME` must be present and must not read like a stand-in:
 * `pending`, `test` and `placeholder` are the three words every interim value
 * in this repository has used (`.env.example`, the Vercel env audit, the
 * preview branch). An unset USE_MOCK is NOT live: `loadCardcomEnv` treats it
 * as mock in every non-production environment, and in production a missing
 * variable is an unfinished setup, not a finished one.
 */

export const PLACEHOLDER_API_NAME = /pending|test|placeholder/i

/** `process.env` or any subset of it: the three keys are read, nothing else is looked at. */
export type LiveReadinessEnv = Readonly<Record<string, string | undefined>>

export type LiveReadiness = {
  /** Mock is off AND the API name is a real one. */
  ready: boolean
  useMock: 'false' | 'true' | 'unset' | 'other'
  apiName: 'missing' | 'placeholder' | 'real'
  /** `CHECKOUT_ENABLED === 'true'`: the flip this check exists to prompt. */
  checkoutEnabled: boolean
}

export function assessLiveReadiness(env: LiveReadinessEnv): LiveReadiness {
  const rawMock = env.CARDCOM_USE_MOCK?.trim()
  const useMock: LiveReadiness['useMock'] =
    rawMock === undefined || rawMock === ''
      ? 'unset'
      : rawMock === 'false'
        ? 'false'
        : rawMock === 'true'
          ? 'true'
          : 'other'

  const rawName = env.CARDCOM_API_NAME?.trim() ?? ''
  const apiName: LiveReadiness['apiName'] =
    rawName === '' ? 'missing' : PLACEHOLDER_API_NAME.test(rawName) ? 'placeholder' : 'real'

  return {
    ready: useMock === 'false' && apiName === 'real',
    useMock,
    apiName,
    checkoutEnabled: env.CHECKOUT_ENABLED?.trim() === 'true',
  }
}

/** The exact body Ofir asked for. The flip is the one remaining manual step. */
export const LIVE_READY_MESSAGE = 'CARDCOM LIVE READY — flip CHECKOUT_ENABLED=true'

export const LIVE_READY_FLAG_DEFAULT = join(homedir(), 'ke-goals', 'LAUNCH-READY.flag')

/**
 * Touch the flag the local goal loop (~/ke-goals) watches.
 *
 * Best effort by design. On Vercel the filesystem is ephemeral and the home
 * directory may not be writable, so a failure here is a field in the response
 * (`flag: 'unwritable'`) and never a 500: the push notification is the
 * channel that matters, and the flag is for the laptop that runs the loop.
 * `LAUNCH_READY_FLAG_PATH` overrides the location (tests, and a loop that
 * keeps its state elsewhere).
 */
export async function touchLaunchReadyFlag(
  path: string = process.env.LAUNCH_READY_FLAG_PATH || LIVE_READY_FLAG_DEFAULT,
  now: Date = new Date(),
): Promise<'written' | 'unwritable'> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${now.toISOString()}\n`, 'utf8')
    return 'written'
  } catch {
    return 'unwritable'
  }
}
