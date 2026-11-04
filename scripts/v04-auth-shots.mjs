#!/usr/bin/env node
/**
 * V04 proof: /login, /register and the code step at 380, 768 and 1440, written
 * to docs/V04/, with horizontal overflow, clipped text and every visible
 * control under 44px measured per shot and printed as JSON so the doc can
 * quote the run.
 *
 *   PORT=3311 pnpm start &
 *   BASE=http://localhost:3311 node scripts/v04-auth-shots.mjs
 *
 * NOTHING IS SENT. The code step is opened by its button, which only swaps the
 * button for the send form; no code is requested from the server.
 *
 * Browse localhost, not 127.0.0.1: server actions reject a mismatched origin.
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3311'
const OUT = path.join(process.cwd(), 'docs', 'V04')
const WIDTHS = [380, 768, 1440]

mkdirSync(OUT, { recursive: true })

async function measure(page) {
  return page.evaluate(() => {
    const small = []
    const root = document.querySelector('.auth-page')
    for (const el of root?.querySelectorAll('button, a[href], input, textarea') ?? []) {
      if (el.type === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (el.closest('[aria-hidden="true"]')) continue
      if (r.width < 44 || r.height < 44) {
        small.push({
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        })
      }
    }
    const clipped = [...(root?.querySelectorAll('*') ?? [])]
      .filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1)
      .filter((el) => getComputedStyle(el).overflowX !== 'visible')
      .map((el) => el.className || el.tagName)
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      small,
      clipped,
      h1: document.querySelector('.auth-page__title')?.textContent?.trim() ?? null,
      headings: [...(root?.querySelectorAll('h2') ?? [])].map((h) => h.textContent?.trim()),
      buttons: [...(root?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim()),
    }
  })
}

const browser = await chromium.launch({ channel: 'chromium' })
const results = []
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 800 : 900 },
      locale: 'he-IL',
    })
    // Pre-answer the consent banner so it does not cover the form (denied, at
    // CONSENT_WORDING_VERSION 3).
    await context.addCookies([{ name: 'ke_consent', value: 'denied.3', url: BASE }])
    const page = await context.newPage()

    const shoot = async (name, url, prepare) => {
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
      await page.locator('.auth-page__title').waitFor()
      if (prepare) await prepare()
      const m = await measure(page)
      // A viewport shot where the step is on screen, then the whole page from
      // the top: a full-page capture taken mid-scroll paints the sticky header
      // where the viewport was.
      if (prepare) await page.screenshot({ path: path.join(OUT, `${name}-fold-${width}.png`) })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true })
      results.push({ shot: `${name}-${width}`, ...m })
    }

    await shoot('login', '/login')
    await shoot('register', '/register')
    await shoot('otp', '/login', async () => {
      await page.getByRole('button', { name: /קוד/ }).first().click()
      await page.getByTestId('otp-send-form').waitFor()
      await page
        .getByTestId('otp-send-form')
        .evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(300)
    })
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify(results, null, 2))
const bad = results.filter((r) => r.overflowX > 0 || r.small.length || r.clipped.length)
process.exitCode = bad.length ? 1 : 0
