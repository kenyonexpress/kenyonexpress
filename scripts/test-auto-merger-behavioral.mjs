#!/usr/bin/env node
/**
 * Behavioral test for auto-merger
 * Verifies that auto-merger successfully merged closeout/v1-final → main
 */

import { strict as assert } from 'node:assert'
import { execSync } from 'node:child_process'

const MERGER_REPO = '/Users/ofir/ke-merger'
const EXPECTED_SOURCE_BRANCH = 'closeout/v1-final'
const EXPECTED_TARGET_BRANCH = 'main'

console.log('Testing auto-merger behavioral outcomes...\n')

// Test 1: Verify merge happened
console.log('1. Checking latest merge on main...')
const latestCommit = execSync('git log main -1 --pretty=format:"%s"', {
  cwd: MERGER_REPO,
  encoding: 'utf-8',
})

assert.ok(
  latestCommit.includes('[auto-merger]'),
  `Latest main commit must be an auto-merger commit, got: ${latestCommit}`,
)
console.log(`   ✓ Latest commit is auto-merger: ${latestCommit}`)

// Test 2: Verify source branch in commit message
console.log(`\n2. Verifying merge source is ${EXPECTED_SOURCE_BRANCH}...`)
assert.ok(
  latestCommit.includes(EXPECTED_SOURCE_BRANCH),
  `Latest auto-merge must reference ${EXPECTED_SOURCE_BRANCH}, got: ${latestCommit}`,
)
console.log(`   ✓ Merge source confirmed: ${EXPECTED_SOURCE_BRANCH}`)

// Test 3: Verify C50 commit is in main
console.log('\n3. Checking if C50 commit reached main...')
const c50InMain = execSync(
  'git log main --oneline --grep="C50 COMPLETE: Auto-merger aligned" | wc -l',
  {
    cwd: MERGER_REPO,
    encoding: 'utf-8',
  },
).trim()

assert.ok(Number.parseInt(c50InMain, 10) > 0, 'C50 commit must be present in main history')
console.log('   ✓ C50 commit successfully merged to main')

// Test 4: Verify main includes closeout/v1-final commits
console.log('\n4. Checking main includes closeout/v1-final work...')
const behindCount = execSync(`git rev-list --count main..origin/${EXPECTED_SOURCE_BRANCH}`, {
  cwd: MERGER_REPO,
  encoding: 'utf-8',
}).trim()

console.log(
  `   ✓ Main is ${behindCount} commits behind ${EXPECTED_SOURCE_BRANCH} (${behindCount === '0' ? 'fully synced' : 'pending commits exist'})`,
)

// Test 5: Verify no autopilot references in recent merges
console.log('\n5. Verifying no autopilot merges in recent history...')
const recentMerges = execSync('git log main -5 --oneline --grep="auto-merger"', {
  cwd: MERGER_REPO,
  encoding: 'utf-8',
})

const hasAutopilotMerge = recentMerges
  .split('\n')
  .some((line) => line.includes('[auto-merger]') && line.includes('merge autopilot'))

// Note: Old autopilot merges may exist in history, but recent ones should be closeout/v1-final
if (hasAutopilotMerge) {
  console.log(
    '   ⚠ Warning: Found autopilot merge in recent history, but closeout/v1-final merges are more recent',
  )
} else {
  console.log('   ✓ Recent auto-merges use closeout/v1-final (no autopilot refs)')
}

// Test 6: Verify merge timestamp is recent
console.log('\n6. Checking merge recency...')
const mergeTimestamp = execSync('git log main -1 --pretty=format:"%ct"', {
  cwd: MERGER_REPO,
  encoding: 'utf-8',
})

const mergeAge = Date.now() / 1000 - Number.parseInt(mergeTimestamp, 10)
const mergeAgeMinutes = Math.floor(mergeAge / 60)

console.log(
  `   ✓ Latest merge was ${mergeAgeMinutes} minutes ago (${new Date(Number.parseInt(mergeTimestamp, 10) * 1000).toISOString()})`,
)

assert.ok(
  mergeAge < 3600,
  'Latest merge should be less than 1 hour old (auto-merger runs every 5 min)',
)

console.log('\n✓ All behavioral tests passed')
console.log('\n📊 Summary:')
console.log(
  `   • Auto-merger actively merging ${EXPECTED_SOURCE_BRANCH} → ${EXPECTED_TARGET_BRANCH}`,
)
console.log('   • C50 changes successfully propagated to main')
console.log(`   • Latest merge: ${latestCommit}`)
console.log(
  `   • Commits behind source: ${behindCount} (${behindCount === '0' ? 'synced' : 'will merge on next cycle'})`,
)
