#!/usr/bin/env node
/**
 * C08: Capture WordPress /my-account/ from Wayback Machine as reference.
 * Then measure our Next.js implementation against it.
 */

import { chromium } from '@playwright/test'

const WAYBACK_URL =
  'http://web.archive.org/web/20260612053828/https://kenyonexpress.co.il/my-account/'
const LOCAL = 'http://localhost:3311'
const WIDTHS = [380, 768, 1440]
const HEIGHT = 2600

async function captureReferences() {
  console.log('C08: Capturing Wayback Machine WordPress reference')
  console.log('='.repeat(60))
  console.log(`Reference: ${WAYBACK_URL}`)
  console.log(`Local: ${LOCAL}/account`)
  console.log(`Widths: ${WIDTHS.join(', ')}px\n`)

  const browser = await chromium.launch()

  try {
    for (const width of WIDTHS) {
      console.log(`\nCapturing at ${width}px...`)

      // Capture Wayback WordPress reference
      const refCtx = await browser.newContext({
        viewport: { width, height: HEIGHT },
        deviceScaleFactor: 1,
      })
      const refPage = await refCtx.newPage()

      try {
        await refPage.goto(WAYBACK_URL, {
          waitUntil: 'networkidle',
          timeout: 60000,
        })
        await refPage.waitForTimeout(3000)

        const refFile = `refs/wayback_account_${width}.png`
        await refPage.screenshot({ path: refFile, fullPage: false })
        console.log(`  ✓ Reference: ${refFile}`)
      } catch (error) {
        console.error(`  ✗ Failed to capture reference: ${error.message}`)
        continue
      } finally {
        await refPage.close()
        await refCtx.close()
      }

      // Capture local Next.js implementation (with auth)
      const localCtx = await browser.newContext({
        viewport: { width, height: HEIGHT },
        deviceScaleFactor: 1,
      })
      const localPage = await localCtx.newPage()

      try {
        // Sign in
        await localPage.goto(`${LOCAL}/login`, { waitUntil: 'domcontentloaded' })
        await localPage
          .getByRole('textbox', { name: 'אימייל', exact: true })
          .fill('e2e-customer@test.kenyonexpress.local')
        await localPage.getByLabel('סיסמה').fill('E2eCustomer!pass1')
        await localPage.getByRole('button', { name: 'כניסה', exact: true }).click()
        await localPage.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })

        await localPage.goto(`${LOCAL}/account`, {
          waitUntil: 'networkidle',
          timeout: 30000,
        })
        await localPage.waitForTimeout(3000)

        const localFile = `refs/local_account_${width}.png`
        await localPage.screenshot({ path: localFile, fullPage: false })
        console.log(`  ✓ Local: ${localFile}`)
      } catch (error) {
        console.error(`  ✗ Failed to capture local: ${error.message}`)
      } finally {
        await localPage.close()
        await localCtx.close()
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('CAPTURE COMPLETE')
  console.log('='.repeat(60))
  console.log('\nNext: Run measurements with compare.mjs')
  console.log('Example:')
  console.log(
    '  node scripts/compare.mjs --page=account --width=380 --baseline=wayback_account_380.png --live-url=http://localhost:3311/account',
  )
}

captureReferences()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
  })
