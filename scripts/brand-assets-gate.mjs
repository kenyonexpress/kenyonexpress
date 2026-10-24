#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const RESET = '\x1b[0m'

const publicDir = join(process.cwd(), 'public')
const srcDir = join(process.cwd(), 'src')

const REQUIRED_ASSETS = [
  { path: 'public/logo.svg', minSize: 400 },
  { path: 'public/logo-192.png', minSize: 1000 },
  { path: 'public/logo-512.png', minSize: 5000 },
  { path: 'public/apple-touch-icon.png', minSize: 1000 },
  { path: 'public/favicon.ico', minSize: 300 },
  { path: 'public/og-default.png', minSize: 10000 },
]

const FORBIDDEN_ASSETS = [
  'public/next.svg',
  'public/vercel.svg',
  'public/file.svg',
  'public/globe.svg',
  'public/window.svg',
]

function checkAsset(relPath, minSize) {
  const fullPath = join(process.cwd(), relPath)

  if (!existsSync(fullPath)) {
    console.error(`${RED}✗${RESET} Missing: ${relPath}`)
    return false
  }

  const size = statSync(fullPath).size
  if (size < minSize) {
    console.error(`${RED}✗${RESET} ${relPath}: Too small (${size} bytes, expected >${minSize})`)
    return false
  }

  return true
}

function checkForbidden(relPath) {
  const fullPath = join(process.cwd(), relPath)
  if (existsSync(fullPath)) {
    console.error(`${RED}✗${RESET} Found forbidden Next.js default: ${relPath}`)
    return false
  }
  return true
}

function checkMetadata() {
  const layoutPath = join(srcDir, 'app', 'layout.tsx')
  const content = readFileSync(layoutPath, 'utf-8')

  const checks = [
    { pattern: /\/og-default\.png/, desc: 'OG default image reference' },
    { pattern: /\/favicon\.ico/, desc: 'favicon.ico reference' },
    { pattern: /\/logo\.svg/, desc: 'logo.svg reference' },
    { pattern: /\/apple-touch-icon\.png/, desc: 'apple-touch-icon.png reference' },
  ]

  let allPassed = true
  for (const check of checks) {
    if (!check.pattern.test(content)) {
      console.error(`${RED}✗${RESET} layout.tsx: Missing ${check.desc}`)
      allPassed = false
    }
  }

  return allPassed
}

function checkSVGContent() {
  const svgPath = join(publicDir, 'logo.svg')
  const content = readFileSync(svgPath, 'utf-8')

  const checks = [
    { pattern: /קניון EXPRESS/, desc: 'Hebrew brand text' },
    { pattern: /#fed700|fill:\s*#fed700|fill="#fed700"/, desc: 'Yellow color (#fed700)' },
    { pattern: /Heebo/, desc: 'Heebo font reference' },
  ]

  let allPassed = true
  for (const check of checks) {
    if (!check.pattern.test(content)) {
      console.error(`${RED}✗${RESET} logo.svg: Missing ${check.desc}`)
      allPassed = false
    }
  }

  return allPassed
}

function main() {
  let failed = false

  // Check required assets exist and are non-trivial
  for (const { path, minSize } of REQUIRED_ASSETS) {
    if (!checkAsset(path, minSize)) {
      failed = true
    }
  }

  // Check forbidden assets are gone
  for (const path of FORBIDDEN_ASSETS) {
    if (!checkForbidden(path)) {
      failed = true
    }
  }

  // Check layout.tsx metadata references
  if (!checkMetadata()) {
    failed = true
  }

  // Check SVG content
  if (!checkSVGContent()) {
    failed = true
  }

  if (failed) {
    console.error(`\n${RED}brand assets gate: FAILED${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}brand assets gate: PASS${RESET}`)
    process.exit(0)
  }
}

main()
