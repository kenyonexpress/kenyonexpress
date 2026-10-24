#!/usr/bin/env node
/**
 * Test auto-merger configuration
 * Verifies that auto-merger.sh is configured to merge closeout/v1-final → main
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const MERGER_SCRIPT = '/Users/ofir/ke-goals/auto-merger.sh'
const EXPECTED_SOURCE_BRANCH = 'closeout/v1-final'
const EXPECTED_TARGET_BRANCH = 'main'

console.log('Testing auto-merger configuration...')

let content
try {
  content = readFileSync(MERGER_SCRIPT, 'utf-8')
} catch (err) {
  console.error(`✗ Failed to read ${MERGER_SCRIPT}: ${err.message}`)
  process.exit(1)
}

// Test 1: Fetches correct branches
const fetchPattern = new RegExp(
  `git fetch origin ${EXPECTED_TARGET_BRANCH} ${EXPECTED_SOURCE_BRANCH}`,
)
assert.ok(
  fetchPattern.test(content),
  `auto-merger must fetch origin ${EXPECTED_TARGET_BRANCH} and ${EXPECTED_SOURCE_BRANCH}`,
)
console.log(`✓ Fetches correct branches: ${EXPECTED_TARGET_BRANCH}, ${EXPECTED_SOURCE_BRANCH}`)

// Test 2: Counts commits from correct source
const countPattern = new RegExp(
  `origin/${EXPECTED_TARGET_BRANCH}\\.\\.origin/${EXPECTED_SOURCE_BRANCH}`,
)
assert.ok(
  countPattern.test(content),
  `auto-merger must count commits from origin/${EXPECTED_TARGET_BRANCH}..origin/${EXPECTED_SOURCE_BRANCH}`,
)
console.log(`✓ Counts pending commits from ${EXPECTED_SOURCE_BRANCH}`)

// Test 3: Merges from correct source with -X theirs
const mergePattern = new RegExp(`git merge --no-ff -X theirs origin/${EXPECTED_SOURCE_BRANCH}`)
assert.ok(
  mergePattern.test(content),
  `auto-merger must merge origin/${EXPECTED_SOURCE_BRANCH} with -X theirs strategy`,
)
console.log(`✓ Merges origin/${EXPECTED_SOURCE_BRANCH} with --no-ff -X theirs`)

// Test 4: Does NOT reference autopilot branch
assert.ok(
  !content.includes('origin/autopilot'),
  'auto-merger must NOT reference origin/autopilot (should use closeout/v1-final)',
)
console.log('✓ Does not reference autopilot branch')

// Test 5: Commit message mentions correct branch
const commitMsgPattern = new RegExp(`merge ${EXPECTED_SOURCE_BRANCH}`)
assert.ok(
  commitMsgPattern.test(content),
  `auto-merger commit messages must mention ${EXPECTED_SOURCE_BRANCH}`,
)
console.log(`✓ Commit messages reference ${EXPECTED_SOURCE_BRANCH}`)

// Test 6: Uses -X theirs for conflict resolution
assert.ok(
  content.includes('git checkout --theirs'),
  'auto-merger must use --theirs for conflict resolution',
)
console.log('✓ Conflicts resolved with --theirs strategy')

console.log('\n✓ All auto-merger configuration tests passed')
console.log(
  `\nConfiguration: ${EXPECTED_SOURCE_BRANCH} → ${EXPECTED_TARGET_BRANCH} (via -X theirs)`,
)
