#!/usr/bin/env node
import { homedir } from 'node:os'
import { resolve } from 'node:path'
/**
 * AUDITS A RUNNING SITE FOR THE TWO STANDING SHELL RULES.
 *
 * The repo has source-level gates for both -- `no-search-ui.test.ts` and
 * `template-asset-scan.mjs` -- and they answer "is the code clean". They cannot
 * answer "is the thing I am looking at clean", and on 2026-09-06 that was the
 * whole question: both gates were green while the site being looked at showed a
 * search box and an iPhone.
 *
 * Point it at a URL and it tells you which build you are on.
 *
 *   node scripts/shell-audit.mjs http://localhost:3312
 *   node scripts/shell-audit.mjs https://kenyonexpress.co.il/
 *
 * Exit: 0 clean, 1 violations.
 */
import { chromium } from '@playwright/test'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(homedir(), 'Library/Caches/ms-playwright')

/** Vendor product lines that must never appear in an image URL. */
const VENDOR =
  /iphone|airpod|ipad|macbook|beats|tesla|smartwatch|redphone|slider-img|screen-shot|galaxy-s\d/i

const url = process.argv[2] ?? 'http://localhost:3312'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 200))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(1500)

const found = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input:not([type=hidden])')].map((i) => ({
    type: i.getAttribute('type'),
    name: i.getAttribute('name'),
    placeholder: i.getAttribute('placeholder'),
  }))
  return {
    searchTyped: document.querySelectorAll('input[type="search"]').length,
    searchRole: document.querySelectorAll('[role="search"], [role="searchbox"]').length,
    inputs,
    images: [...document.images].map((i) => i.currentSrc || i.src).filter(Boolean),
  }
})
await browser.close()

const problems = []
if (found.searchTyped) problems.push(`${found.searchTyped} input[type=search]`)
if (found.searchRole) problems.push(`${found.searchRole} element(s) with a search role`)
for (const input of found.inputs) {
  if (input.type !== 'email' && /search|חיפוש|\bq\b/i.test(`${input.name} ${input.placeholder}`)) {
    problems.push(`search-shaped input: name=${input.name} placeholder=${input.placeholder}`)
  }
}
const vendorImages = [...new Set(found.images.filter((src) => VENDOR.test(src)))]
for (const src of vendorImages) problems.push(`vendor image: ${src.slice(0, 110)}`)

console.log(`shell audit: ${url}`)
console.log(`  images: ${found.images.length}  inputs: ${found.inputs.length}`)
if (problems.length === 0) {
  console.log('  CLEAN: no search control, no vendor product imagery')
  process.exit(0)
}
console.log(`  ${problems.length} problem(s):`)
for (const p of problems) console.log(`    - ${p}`)
process.exit(1)
