#!/usr/bin/env node
import fs from 'node:fs'

const logFile =
  process.argv[2] ||
  '/private/tmp/claude-501/-Users-ofir-kenyonexpress-autopilot/4d7b804e-7ea9-4eac-bf34-12f1bf8e285b/tasks/bu2xgc3fa.output'

if (!fs.existsSync(logFile)) {
  console.error(`File not found: ${logFile}`)
  process.exit(1)
}

const content = fs.readFileSync(logFile, 'utf-8')
const lines = content.split('\n')

// Find the final summary line
let summaryLine = ''
let passed = 0
let failed = 0
let skipped = 0
let flaky = 0

for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i]
  if (/^\s+\d+\s+(passed|failed|skipped)/.test(line)) {
    console.log(`Found summary: ${line}`)
  }
  // Look for the playwright final summary
  if (line.match(/passed.*failed.*skipped/) || line.match(/^\s+\d+ passed/)) {
    summaryLine = line
    break
  }
}

// Count failures by scanning for test failure markers
const failureMatches = content.match(/^\s+\d+\)\s+\[/gm) || []
failed = failureMatches.length

// Count skipped tests
const skippedMatches = content.match(/⊘ skipped/gm) || []
skipped = skippedMatches.length

// Count flaky by looking for retries
const flakyMatches = content.match(/\(attempt [2-9].*\)/gm) || []
flaky = flakyMatches.length

// Find last test number
const lastTestMatch = content.match(/\[(\d+)\/682\]/g)
const totalCompleted = lastTestMatch
  ? Number.parseInt(lastTestMatch[lastTestMatch.length - 1].match(/\d+/)[0])
  : 0

passed = totalCompleted - failed - skipped

console.log('\n=== E2E Test Results ===')
console.log(`Total Tests Run: ${totalCompleted}/682`)
console.log(`Passed: ${passed} (${((passed / totalCompleted) * 100).toFixed(1)}%)`)
console.log(`Failed: ${failed} (${((failed / totalCompleted) * 100).toFixed(1)}%)`)
console.log(`Skipped: ${skipped} (${((skipped / totalCompleted) * 100).toFixed(1)}%)`)
console.log(`Flaky (retried): ${flaky}`)

if (summaryLine) {
  console.log(`\nPlaywright Summary: ${summaryLine}`)
}

// Extract a list of failed test names
const failedTests = []
const failurePattern = /^\s+\d+\)\s+\[([^\]]+)\]\s+›\s+(.+)$/gm
let match = failurePattern.exec(content)
while (match !== null) {
  failedTests.push(`${match[1]}: ${match[2]}`)
  match = failurePattern.exec(content)
}

if (failedTests.length > 0) {
  console.log('\n=== Failed Tests (first 10) ===')
  for (const test of failedTests.slice(0, 10)) {
    console.log(`- ${test}`)
  }
  if (failedTests.length > 10) {
    console.log(`... and ${failedTests.length - 10} more`)
  }
}

process.exit(0)
