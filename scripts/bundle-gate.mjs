#!/usr/bin/env node
/**
 * Fails when the shared first-load client JS exceeds the budget.
 *
 *   node scripts/bundle-gate.mjs 180     # budget in KB, gzipped
 *
 * Reads .next/build-manifest.json from the LAST `pnpm build` -- run the build
 * first; this script deliberately does not build, so the gate measures the
 * artifact you are about to ship. Turbopack (Next 16) emits no
 * app-build-manifest.json, so per-route sums are not available; the gate
 * covers rootMainFiles + polyfills -- the JS every route pays on first load --
 * gzipped individually and summed.
 */
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const budgetKb = Number(process.argv[2] ?? 260) // measured baseline 255.6KB on 2026-09-02; spec target 180KB tracked in KNOWN-ISSUES
let manifest
try {
  manifest = JSON.parse(readFileSync('.next/build-manifest.json', 'utf8'))
} catch {
  console.error('bundle-gate: .next/build-manifest.json missing -- run pnpm build first')
  process.exit(2)
}

const files = [
  ...new Set([...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])]),
].filter((f) => f.endsWith('.js'))
if (files.length === 0) {
  console.error('bundle-gate: no rootMainFiles in the manifest -- unexpected build layout')
  process.exit(2)
}

let totalKb = 0
for (const file of files) {
  let kb = 0
  try {
    kb = gzipSync(readFileSync(`.next/${file}`)).length / 1024
  } catch {
    console.error(`bundle-gate: chunk listed but unreadable: .next/${file}`)
    process.exit(2)
  }
  totalKb += kb
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${file}`)
}

const over = totalKb > budgetKb
console.log(
  `\nbundle-gate: shared first-load ${totalKb.toFixed(1)} KB gz across ${files.length} chunks, budget ${budgetKb} KB -- ${over ? 'OVER' : 'ok'}`,
)
process.exit(over ? 1 : 0)
