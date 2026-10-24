#!/usr/bin/env node

/**
 * M-CYCLE TESTS
 *
 * Tests for the M-cycle maintenance monitoring system.
 */

import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

describe('M-Cycle System', () => {
  describe('m-cycle.mjs script', () => {
    it('should exist and be executable', () => {
      const scriptPath = path.join(projectRoot, 'scripts', 'm-cycle.mjs')
      expect(fs.existsSync(scriptPath)).toBe(true)

      const stats = fs.statSync(scriptPath)
      // Check if executable bit is set (on Unix-like systems)
      expect(stats.mode & 0o111).toBeGreaterThan(0)
    })

    it('should run in dry-run mode without errors', () => {
      const result = execSync('node scripts/m-cycle.mjs --dry-run', {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 30000,
      })

      expect(result).toContain('Starting M-Cycle (DRY-RUN)')
      expect(result).toContain('M-CYCLE] Running 18 tasks')
      expect(result).toContain('M-Cycle complete: 0 pass, 0 fail')
    })

    it('should generate M-CYCLE-STATUS.md report', () => {
      execSync('node scripts/m-cycle.mjs --dry-run', {
        cwd: projectRoot,
        timeout: 30000,
      })

      const reportPath = path.join(projectRoot, 'docs', 'M-CYCLE-STATUS.md')
      expect(fs.existsSync(reportPath)).toBe(true)

      const report = fs.readFileSync(reportPath, 'utf8')
      expect(report).toContain('# M-Cycle Status')
      expect(report).toContain('**Last Run:**')
      expect(report).toContain('**Mode:** DRY-RUN')
      expect(report).toContain('## Summary')
      expect(report).toContain('Total Tasks | 18')
    })

    it('should accept --task filter', () => {
      const result = execSync('node scripts/m-cycle.mjs --task=M01 --dry-run', {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 30000,
      })

      expect(result).toContain('[M01] Starting: Type Check')
      expect(result).toContain('M-CYCLE] Running 1 tasks')
    })

    it('should exit 0 on dry-run success', () => {
      const exitCode = execSync('node scripts/m-cycle.mjs --dry-run; echo $?', {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 30000,
        shell: '/bin/bash',
      }).trim()

      expect(exitCode.endsWith('0')).toBe(true)
    })
  })

  describe('Task Definitions', () => {
    it('should have exactly 18 tasks defined (M01-M18)', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'm-cycle.mjs'),
        'utf8',
      )

      // Count M01 through M18 task definitions
      const taskMatches = scriptContent.match(/M\d{2}:/g)
      expect(taskMatches).toBeDefined()
      expect(taskMatches?.length).toBe(18)

      // Verify sequential M01-M18
      for (let i = 1; i <= 18; i++) {
        const taskId = `M${i.toString().padStart(2, '0')}`
        expect(scriptContent).toContain(`${taskId}:`)
      }
    })

    it('should have critical tasks flagged correctly', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'm-cycle.mjs'),
        'utf8',
      )

      // M01, M02, M03, M12, M13 should be critical
      const criticalTasks = ['M01', 'M02', 'M03', 'M12', 'M13']

      for (const taskId of criticalTasks) {
        const taskBlockRegex = new RegExp(`${taskId}:\\s*{[^}]+critical:\\s*true`, 's')
        expect(scriptContent).toMatch(taskBlockRegex)
      }
    })

    it('should have timeouts defined for all tasks', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'm-cycle.mjs'),
        'utf8',
      )

      // Each task should have a timeout
      for (let i = 1; i <= 18; i++) {
        const taskId = `M${i.toString().padStart(2, '0')}`
        const taskBlockRegex = new RegExp(`${taskId}:\\s*{[^}]+timeout:\\s*\\d+`, 's')
        expect(scriptContent).toMatch(taskBlockRegex)
      }
    })
  })

  describe('Shell Scripts', () => {
    it('run-m-cycle-loop.sh should exist and be executable', () => {
      const scriptPath = path.join(projectRoot, 'scripts', 'run-m-cycle-loop.sh')
      expect(fs.existsSync(scriptPath)).toBe(true)

      const stats = fs.statSync(scriptPath)
      expect(stats.mode & 0o111).toBeGreaterThan(0)
    })

    it('start-m-cycle-tmux.sh should exist and be executable', () => {
      const scriptPath = path.join(projectRoot, 'scripts', 'start-m-cycle-tmux.sh')
      expect(fs.existsSync(scriptPath)).toBe(true)

      const stats = fs.statSync(scriptPath)
      expect(stats.mode & 0o111).toBeGreaterThan(0)
    })

    it('run-m-cycle-loop.sh should reference correct stop flag', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'run-m-cycle-loop.sh'),
        'utf8',
      )

      expect(scriptContent).toContain('STOP_FLAG="/tmp/m-cycle.stop"')
    })

    it('run-m-cycle-loop.sh should have 2-hour interval', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'run-m-cycle-loop.sh'),
        'utf8',
      )

      expect(scriptContent).toContain('CYCLE_INTERVAL=$((2 * 60 * 60))')
    })

    it('start-m-cycle-tmux.sh should reference ke-final session', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'start-m-cycle-tmux.sh'),
        'utf8',
      )

      expect(scriptContent).toContain('SESSION_NAME="ke-final"')
    })
  })

  describe('Documentation', () => {
    it('M-CYCLE.md should exist', () => {
      const docPath = path.join(projectRoot, 'docs', 'M-CYCLE.md')
      expect(fs.existsSync(docPath)).toBe(true)
    })

    it('M-CYCLE.md should document all 18 tasks', () => {
      const docContent = fs.readFileSync(path.join(projectRoot, 'docs', 'M-CYCLE.md'), 'utf8')

      // Should have task table with M01-M18
      for (let i = 1; i <= 18; i++) {
        const taskId = `M${i.toString().padStart(2, '0')}`
        expect(docContent).toContain(taskId)
      }
    })

    it('M-CYCLE.md should document usage commands', () => {
      const docContent = fs.readFileSync(path.join(projectRoot, 'docs', 'M-CYCLE.md'), 'utf8')

      expect(docContent).toContain('./scripts/start-m-cycle-tmux.sh')
      expect(docContent).toContain('tmux attach -t ke-final')
      expect(docContent).toContain('touch /tmp/m-cycle.stop')
    })

    it('C46-RESULT.md should exist', () => {
      const resultPath = path.join(projectRoot, 'docs', 'C46-RESULT.md')
      expect(fs.existsSync(resultPath)).toBe(true)
    })
  })

  describe('Integration', () => {
    it('should reference correct ntfy.sh endpoint', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'run-m-cycle-loop.sh'),
        'utf8',
      )

      expect(scriptContent).toContain('ntfy.sh/kenyon-ofir-limit')
    })

    it('should write to docs/M-CYCLE-STATUS.md', () => {
      const scriptContent = fs.readFileSync(
        path.join(projectRoot, 'scripts', 'm-cycle.mjs'),
        'utf8',
      )

      expect(scriptContent).toContain("path.join(projectRoot, 'docs', 'M-CYCLE-STATUS.md')")
    })
  })
})
