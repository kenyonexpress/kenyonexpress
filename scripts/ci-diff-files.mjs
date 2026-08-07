#!/usr/bin/env node
/**
 * Shared helper: list files changed in the scoped git range.
 *
 * Default range (goal contract): HEAD~1..HEAD via
 *   git diff HEAD~1..HEAD --name-only
 * Override with CI_DIFF_RANGE ("base..head") or --range=base..head.
 * For pull_request CI, set CI_DIFF_RANGE to origin/$GITHUB_BASE_REF...HEAD.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    if (allowFailure) return null
    throw error
  }
}

export function resolveRange() {
  const flag = process.argv.find((arg) => arg.startsWith('--range='))
  if (flag) return flag.slice('--range='.length)
  if (process.env.CI_DIFF_RANGE) return process.env.CI_DIFF_RANGE

  if (git(['rev-parse', '--verify', 'HEAD~1'], { allowFailure: true }) !== null) {
    return 'HEAD~1..HEAD'
  }
  return 'HEAD'
}

/**
 * @param {{ range?: string, predicate?: (file: string) => boolean, includeWorkingTree?: boolean }} opts
 */
export function changedFiles(opts = {}) {
  const range = opts.range ?? resolveRange()
  const predicate = opts.predicate ?? (() => true)

  let committed = ''
  if (range === 'HEAD') {
    committed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], {
      allowFailure: true,
    })
  } else {
    committed = git(['diff', '--name-only', '--diff-filter=ACMR', range], { allowFailure: true })
  }

  const parts = [committed]
  if (opts.includeWorkingTree) {
    parts.push(git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { allowFailure: true }))
    parts.push(git(['ls-files', '--others', '--exclude-standard'], { allowFailure: true }))
  }

  const all = parts
    .filter(Boolean)
    .flatMap((out) => out.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean)

  return [...new Set(all)].filter((file) => predicate(file) && existsSync(file))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const range = resolveRange()
  const files = changedFiles({ range, includeWorkingTree: false })
  console.log(`ci-diff-files: range ${range}`)
  for (const file of files) console.log(file)
}
