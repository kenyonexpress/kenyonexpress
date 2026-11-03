#!/usr/bin/env node

/**
 * M06 for the M-cycle: serve the build M03 just made and smoke Lighthouse on it,
 * three times.
 *
 * lighthouse-smoke.mjs expects a server on LOCAL_BASE. The loop has none, and
 * Chrome answers a refused connection with an interstitial, which read as a
 * page failure. This starts `next start` on a port nobody else uses, waits for
 * it, runs the smoke, and stops the server it started (by its own PID, never by
 * name: other sessions keep their own servers on 3000 and 3311).
 *
 *   node scripts/m-cycle-lighthouse.mjs
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, openSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = process.env.M_CYCLE_LH_PORT ?? '3397'
const BASE = `http://localhost:${PORT}`

if (!existsSync(path.join(projectRoot, '.next', 'BUILD_ID'))) {
  console.error('m-cycle-lighthouse: no .next/BUILD_ID, run pnpm build first (M03)')
  process.exit(2)
}

const taken = spawnSync('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-t'], {
  encoding: 'utf8',
})
if (taken.stdout.trim()) {
  // `next start` silently moves to another port when this one is taken, and the
  // smoke would then measure whatever already answers here.
  console.error(`m-cycle-lighthouse: port ${PORT} already in use (pid ${taken.stdout.trim()})`)
  process.exit(2)
}

// Server output goes to a file, not a pipe: this process then blocks in
// spawnSync, nobody drains a pipe, and once its buffer fills `next start` stalls
// on write and every later Lighthouse run times out (measured: run 1 fine,
// runs 2 and 3 ETIMEDOUT).
const logPath = path.join(mkdtempSync(path.join(tmpdir(), 'm-cycle-lh-')), 'server.log')
const logFd = openSync(logPath, 'w')
const server = spawn(
  path.join(projectRoot, 'node_modules', '.bin', 'next'),
  ['start', '-p', PORT],
  {
    cwd: projectRoot,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  },
)

function stop() {
  try {
    process.kill(-server.pid, 'SIGINT')
  } catch {}
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) return false
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) })
      if (res.status < 500) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

const ready = await waitReady()
if (!ready) {
  stop()
  console.error(
    `m-cycle-lighthouse: server on ${PORT} never answered\n${readFileSync(logPath, 'utf8').slice(-1500)}`,
  )
  process.exit(2)
}

// Simulated throttling on localhost swung 97 / 87 / 81 / 82 on one unchanged
// build here (2026-11-03); lighthouse-smoke.mjs's header says the same. So this
// uses devtools throttling, and the median of three as C181 did: pass when at
// least two pass.
const RUNS = 3
let passes = 0
for (let i = 1; i <= RUNS; i++) {
  const smoke = spawnSync('node', [path.join(projectRoot, 'scripts', 'lighthouse-smoke.mjs')], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, LOCAL_BASE: BASE, LH_THROTTLING: 'devtools' },
    timeout: 150000,
  })
  process.stdout.write(`run ${i}/${RUNS}: ${smoke.stdout ?? ''}`)
  process.stderr.write(smoke.stderr ?? '')
  if (smoke.error) console.error(`run ${i}: ${smoke.error.message}`)
  if (smoke.status === 0) passes++
}
stop()
console.log(`m-cycle-lighthouse: ${passes}/${RUNS} runs passed`)
process.exit(passes * 2 > RUNS ? 0 : 1)
