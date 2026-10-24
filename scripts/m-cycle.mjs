#!/usr/bin/env node

/**
 * M-CYCLE: 2-Hour Maintenance Cycle System
 *
 * Runs 18 critical maintenance tasks (M01-M18) on a 2-hour cycle.
 * Designed to run in tmux session "ke-final" for continuous monitoring.
 *
 * Usage: node scripts/m-cycle.mjs [--task=M01] [--dry-run]
 *
 * Exit codes:
 * 0 - All tasks passed
 * 1 - One or more tasks failed
 * 2 - Critical failure (script error)
 */

import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Task definitions: M01-M18
const TASKS = {
  M01: {
    name: 'Type Check',
    cmd: 'pnpm type-check',
    timeout: 120000,
    critical: true,
  },
  M02: {
    name: 'Lint Check',
    cmd: 'pnpm lint',
    timeout: 120000,
    critical: true,
  },
  M03: {
    name: 'Build Test',
    cmd: 'pnpm build',
    timeout: 300000,
    critical: true,
  },
  M04: {
    name: 'E2E Health',
    script: 'parse-e2e-results.mjs',
    timeout: 10000,
    critical: false,
  },
  M05: {
    name: 'DB Performance',
    script: 'db-performance-monitor.mjs',
    timeout: 30000,
    critical: false,
  },
  M06: {
    name: 'Lighthouse Smoke',
    script: 'lighthouse-smoke.mjs',
    timeout: 60000,
    critical: false,
  },
  M07: {
    name: 'Prerender Chunks',
    script: 'prerender-chunk-gate.mjs',
    timeout: 30000,
    critical: false,
  },
  M08: {
    name: 'Code Debt Scan',
    script: 'audit-hardcoded.mjs',
    timeout: 30000,
    critical: false,
  },
  M09: {
    name: 'Deps Status',
    cmd: 'pnpm outdated --format json',
    timeout: 30000,
    critical: false,
    expectFail: true, // outdated returns non-zero when updates available
  },
  M10: {
    name: 'Cron Status',
    script: 'audit-cron-drift.mjs',
    timeout: 15000,
    critical: false,
  },
  M11: {
    name: 'Gate Status',
    script: 'parity-log.mjs',
    timeout: 30000,
    critical: false,
  },
  M12: {
    name: 'Secret Audit',
    script: 'audit-secrets.mjs',
    timeout: 20000,
    critical: true,
  },
  M13: {
    name: 'Money Constraints',
    script: 'audit-money-constraints.mjs',
    timeout: 15000,
    critical: true,
  },
  M14: {
    name: 'Role Separation',
    script: 'audit-role-separation.mjs',
    timeout: 15000,
    critical: false,
  },
  M15: {
    name: 'Canonical Host',
    script: 'audit-canonical-host.mjs',
    timeout: 15000,
    critical: false,
  },
  M16: {
    name: 'Deployed Build',
    script: 'audit-deployed-build.mjs',
    timeout: 20000,
    critical: false,
  },
  M17: {
    name: 'Default Branch',
    script: 'audit-default-branch-config.mjs',
    timeout: 10000,
    critical: false,
  },
  M18: {
    name: 'Backup Health',
    script: 'backup-health-check.mjs',
    timeout: 15000,
    critical: false,
  },
}

// Parse CLI args
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const taskFilter = args.find((a) => a.startsWith('--task='))?.split('=')[1]

function log(level, taskId, message) {
  const timestamp = new Date().toISOString()
  const prefix = taskId ? `[${taskId}]` : '[M-CYCLE]'
  console.log(`${timestamp} ${level.padEnd(5)} ${prefix} ${message}`)
}

function runTask(taskId, task) {
  const startTime = Date.now()
  log('INFO', taskId, `Starting: ${task.name}`)

  if (dryRun) {
    log('INFO', taskId, 'DRY-RUN: Skipped')
    return { status: 'skipped', duration: 0 }
  }

  try {
    let cmd
    if (task.cmd) {
      cmd = task.cmd
    } else if (task.script) {
      cmd = `node ${path.join(projectRoot, 'scripts', task.script)}`
    } else {
      throw new Error('Task has no cmd or script defined')
    }

    const output = execSync(cmd, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: task.timeout,
      stdio: 'pipe',
    })

    const duration = Date.now() - startTime
    log('PASS', taskId, `Completed in ${duration}ms`)

    return {
      status: 'pass',
      duration,
      output: output.trim().split('\n').slice(-5).join('\n'), // Last 5 lines
    }
  } catch (error) {
    const duration = Date.now() - startTime

    // Check if this task is expected to fail (e.g., pnpm outdated)
    if (task.expectFail) {
      log('PASS', taskId, `Completed (expected non-zero exit) in ${duration}ms`)
      return {
        status: 'pass',
        duration,
        output: error.stdout?.trim().split('\n').slice(-5).join('\n'),
      }
    }

    const severity = task.critical ? 'FAIL' : 'WARN'
    log(severity, taskId, `Failed in ${duration}ms: ${error.message}`)

    return {
      status: 'fail',
      duration,
      error: error.message,
      stderr: error.stderr?.trim().split('\n').slice(-10).join('\n'),
      critical: task.critical,
    }
  }
}

function writeCycleReport(results) {
  const reportPath = path.join(projectRoot, 'docs', 'M-CYCLE-STATUS.md')
  const timestamp = new Date().toISOString()
  const passed = results.filter((r) => r.result.status === 'pass').length
  const failed = results.filter((r) => r.result.status === 'fail').length
  const skipped = results.filter((r) => r.result.status === 'skipped').length
  const criticalFailed = results.filter(
    (r) => r.result.status === 'fail' && r.result.critical,
  ).length

  const resultStatus =
    failed === 0
      ? '✅ ALL PASS'
      : criticalFailed > 0
        ? '❌ CRITICAL FAILURES'
        : '⚠️ NON-CRITICAL FAILURES'

  const report = `# M-Cycle Status

**Last Run:** ${timestamp}
**Mode:** ${dryRun ? 'DRY-RUN' : 'LIVE'}
**Result:** ${resultStatus}

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks | ${results.length} |
| Passed | ${passed} |
| Failed | ${failed} |
| Skipped | ${skipped} |
| Critical Failures | ${criticalFailed} |

## Task Results

| ID | Task | Status | Duration | Critical |
|----|------|--------|----------|----------|
${results
  .map((r) => {
    const status =
      r.result.status === 'pass'
        ? '✅ PASS'
        : r.result.status === 'fail'
          ? r.result.critical
            ? '❌ FAIL'
            : '⚠️ WARN'
          : '⏭️ SKIP'
    const duration = r.result.duration ? `${r.result.duration}ms` : '-'
    const critical = r.task.critical ? 'Yes' : 'No'
    return `| ${r.id} | ${r.task.name} | ${status} | ${duration} | ${critical} |`
  })
  .join('\n')}

## Failed Tasks

${
  failed > 0
    ? results
        .filter((r) => r.result.status === 'fail')
        .map(
          (r) => `### ${r.id}: ${r.task.name}

**Status:** ${r.result.critical ? '❌ CRITICAL FAILURE' : '⚠️ NON-CRITICAL FAILURE'}
**Duration:** ${r.result.duration}ms

\`\`\`
${r.result.stderr || r.result.error || 'No error details'}
\`\`\`
`,
        )
        .join('\n')
    : '*No failed tasks*'
}

## Next Cycle

Expected: ${new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()} (2 hours)
`

  fs.writeFileSync(reportPath, report, 'utf8')
  log('INFO', null, 'Report written to docs/M-CYCLE-STATUS.md')
}

async function main() {
  log('INFO', null, `Starting M-Cycle ${dryRun ? '(DRY-RUN)' : ''}`)
  log('INFO', null, `Working directory: ${projectRoot}`)

  const tasksToRun = taskFilter
    ? Object.entries(TASKS).filter(([id]) => id === taskFilter)
    : Object.entries(TASKS)

  if (tasksToRun.length === 0) {
    log('ERROR', null, `No tasks found matching filter: ${taskFilter}`)
    process.exit(2)
  }

  log('INFO', null, `Running ${tasksToRun.length} tasks...`)

  const results = []
  for (const [id, task] of tasksToRun) {
    const result = runTask(id, task)
    results.push({ id, task, result })
  }

  writeCycleReport(results)

  const criticalFailures = results.filter(
    (r) => r.result.status === 'fail' && r.result.critical,
  ).length
  const totalFailures = results.filter((r) => r.result.status === 'fail').length
  const passCount = results.filter((r) => r.result.status === 'pass').length

  log(
    'INFO',
    null,
    `M-Cycle complete: ${passCount} pass, ${totalFailures} fail (${criticalFailures} critical)`,
  )

  if (criticalFailures > 0) {
    process.exit(1)
  }

  process.exit(0)
}

main().catch((error) => {
  log('ERROR', null, `M-Cycle crashed: ${error.message}`)
  console.error(error)
  process.exit(2)
})
