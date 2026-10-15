import { mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@playwright/test'

/**
 * The three money specs (admin-refund, full-purchase-redeem,
 * physical-purchase) drive ONE seeded customer account, and that account's
 * cart is a row on the shared database: a line added by one worker is paid
 * for, or emptied, by the other. With two workers the chromium tail
 * (physical-purchase) and the mobile-chrome head (admin-refund) run side by
 * side, so the specs take this lock around each case and run one at a time
 * across workers. A directory is the lock because mkdir is atomic; a holder
 * that died leaves it behind, so one older than the longest money case is
 * taken over.
 */
const LOCK_DIR = join(tmpdir(), 'ke-e2e-money.lock')
const STALE_AFTER_MS = 5 * 60_000
const WAIT_AT_MOST_MS = 6 * 60_000
const POLL_MS = 500

let held = false

/** Takes the lock; resolves with the milliseconds spent waiting for it. */
export async function acquireMoneyLock(): Promise<number> {
  const started = Date.now()
  for (;;) {
    try {
      mkdirSync(LOCK_DIR)
      held = true
      return Date.now() - started
    } catch {
      // Held by another worker (or stale); decided below.
    }
    try {
      if (Date.now() - statSync(LOCK_DIR).mtimeMs > STALE_AFTER_MS) {
        rmSync(LOCK_DIR, { recursive: true, force: true })
        continue
      }
    } catch {
      // Released between the mkdir and the stat; try again.
      continue
    }
    if (Date.now() - started > WAIT_AT_MOST_MS) {
      throw new Error(`money lock ${LOCK_DIR} held for over ${WAIT_AT_MOST_MS}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

export function releaseMoneyLock(): void {
  if (!held) return
  held = false
  rmSync(LOCK_DIR, { recursive: true, force: true })
}

/** Call inside the describe block: every case of it holds the lock. */
export function serializeMoneyCases(): void {
  test.beforeEach(async () => {
    // The wait is not the case's time: a worker queued behind two money
    // cases would otherwise spend its whole budget on the lock.
    const waited = await acquireMoneyLock()
    test.setTimeout(test.info().timeout + waited)
  })
  test.afterEach(() => {
    releaseMoneyLock()
  })
}
