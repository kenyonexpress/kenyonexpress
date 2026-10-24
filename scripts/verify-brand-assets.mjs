#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const publicDir = join(process.cwd(), 'public')

async function verifyAsset(path, expectedWidth, expectedHeight, name) {
  const fullPath = join(publicDir, path)

  if (!existsSync(fullPath)) {
    console.error(`✗ ${name}: File not found at ${path}`)
    return false
  }

  try {
    const metadata = await sharp(fullPath).metadata()

    if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
      console.error(
        `✗ ${name}: Expected ${expectedWidth}×${expectedHeight}, got ${metadata.width}×${metadata.height}`,
      )
      return false
    }

    // Check if image has non-white pixels (indicating text/content rendered)
    const { data } = await sharp(fullPath).raw().toBuffer({ resolveWithObject: true })

    let hasContent = false
    // Sample pixels to check for non-white content
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      // Check for yellow (#fed700) or any non-white pixel
      if (r < 250 || g < 250 || b < 250) {
        hasContent = true
        break
      }
    }

    if (!hasContent) {
      console.error(`✗ ${name}: Image appears to be blank (all white pixels)`)
      return false
    }

    console.log(`✓ ${name}: ${expectedWidth}×${expectedHeight}, contains rendered content`)
    return true
  } catch (error) {
    console.error(`✗ ${name}: Error reading image - ${error.message}`)
    return false
  }
}

async function verifySVG(path, name) {
  const fullPath = join(publicDir, path)

  if (!existsSync(fullPath)) {
    console.error(`✗ ${name}: File not found`)
    return false
  }

  const content = readFileSync(fullPath, 'utf-8')

  // Check for required elements
  const checks = [
    { pattern: /קניון EXPRESS/, desc: 'Hebrew text' },
    { pattern: /#fed700/, desc: 'yellow color' },
    { pattern: /Heebo/, desc: 'Heebo font' },
    { pattern: /direction="rtl"|dir="rtl"/, desc: 'RTL direction' },
  ]

  let allPassed = true
  for (const check of checks) {
    if (!check.pattern.test(content)) {
      console.error(`✗ ${name}: Missing ${check.desc}`)
      allPassed = false
    }
  }

  if (allPassed) {
    console.log(`✓ ${name}: All SVG requirements met`)
  }
  return allPassed
}

async function main() {
  console.log('Verifying brand assets...\n')

  const results = await Promise.all([
    verifySVG('logo.svg', 'logo.svg'),
    verifyAsset('logo-192.png', 192, 192, 'logo-192.png'),
    verifyAsset('logo-512.png', 512, 512, 'logo-512.png'),
    verifyAsset('apple-touch-icon.png', 180, 180, 'apple-touch-icon.png'),
    verifyAsset('favicon.ico', 32, 32, 'favicon.ico'),
    verifyAsset('og-default.png', 1200, 630, 'og-default.png'),
  ])

  console.log('')
  const allPassed = results.every((r) => r)

  if (allPassed) {
    console.log('✓ All brand assets verified successfully')
    process.exit(0)
  } else {
    console.error('✗ Some brand assets failed verification')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Verification error:', err)
  process.exit(1)
})
