#!/usr/bin/env node
// rtl-lint.mjs
// Read-only scanner for physical CSS properties and Tailwind classes that
// break RTL (dir=rtl). Reports each hit with its logical replacement.
// Usage: node scripts/rtl-lint.mjs   (run from repo root)
// No external dependencies. Only reads files, never writes source.

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const SRC_DIR = path.join(REPO_ROOT, 'src')
const OUT_FILE = path.join(REPO_ROOT, 'docs', 'rtl-violations.md')

const EXTENSIONS = new Set(['.ts', '.tsx', '.css'])
const SKIP_DIRS = new Set(['node_modules', '.next'])

// Each rule: a regex with the global flag and a human label + logical fix.
// Prefix/suffix lookarounds keep matches at token boundaries so we do not
// match substrings inside unrelated identifiers (e.g. "control-", "rounded-lg").
const RULES = [
  // --- CSS physical properties ---
  { re: /padding-left/g, physical: 'padding-left', logical: 'padding-inline-start' },
  { re: /padding-right/g, physical: 'padding-right', logical: 'padding-inline-end' },
  { re: /margin-left/g, physical: 'margin-left', logical: 'margin-inline-start' },
  { re: /margin-right/g, physical: 'margin-right', logical: 'margin-inline-end' },
  { re: /border-left/g, physical: 'border-left', logical: 'border-inline-start' },
  { re: /border-right/g, physical: 'border-right', logical: 'border-inline-end' },
  { re: /text-align\s*:\s*left/g, physical: 'text-align:left', logical: 'text-align: start' },
  { re: /text-align\s*:\s*right/g, physical: 'text-align:right', logical: 'text-align: end' },
  // Standalone positional properties (not preceded by a word char or hyphen,
  // so "margin-left:" / "border-left:" do not match here).
  { re: /(?<![\w-])left\s*:/g, physical: 'left:', logical: 'inset-inline-start:' },
  { re: /(?<![\w-])right\s*:/g, physical: 'right:', logical: 'inset-inline-end:' },

  // --- Tailwind class tokens ending with a hyphen (followed by a value) ---
  { re: /(?<![\w-])pl-(?=[\w[])/g, physical: 'pl-', logical: 'ps-' },
  { re: /(?<![\w-])pr-(?=[\w[])/g, physical: 'pr-', logical: 'pe-' },
  { re: /(?<![\w-])ml-(?=[\w[])/g, physical: 'ml-', logical: 'ms-' },
  { re: /(?<![\w-])mr-(?=[\w[])/g, physical: 'mr-', logical: 'me-' },
  { re: /(?<![\w-])left-(?=[\w[])/g, physical: 'left-', logical: 'start-' },
  { re: /(?<![\w-])right-(?=[\w[])/g, physical: 'right-', logical: 'end-' },

  // --- Tailwind class tokens without a trailing hyphen ---
  // Suffix (?![A-Za-z]) rejects letters so "rounded-lg" and "border-left"
  // are NOT matched, while "rounded-l-lg" / "border-l-2" still are.
  { re: /(?<![\w-])text-left(?![A-Za-z])/g, physical: 'text-left', logical: 'text-start' },
  { re: /(?<![\w-])text-right(?![A-Za-z])/g, physical: 'text-right', logical: 'text-end' },
  { re: /(?<![\w-])rounded-l(?![A-Za-z])/g, physical: 'rounded-l', logical: 'rounded-s' },
  { re: /(?<![\w-])rounded-r(?![A-Za-z])/g, physical: 'rounded-r', logical: 'rounded-e' },
  { re: /(?<![\w-])border-l(?![A-Za-z])/g, physical: 'border-l', logical: 'border-s' },
  { re: /(?<![\w-])border-r(?![A-Za-z])/g, physical: 'border-r', logical: 'border-e' },
]

/** Recursively collect scannable files under a directory. */
function collectFiles(dir, acc) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectFiles(path.join(dir, entry.name), acc)
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(path.join(dir, entry.name))
    }
  }
  return acc
}

/** Scan one file, returning an array of violation records. */
function scanFile(file) {
  const rel = path.relative(REPO_ROOT, file)
  const violations = []
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

  lines.forEach((line, idx) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0
      const seen = new Set()
      let m = rule.re.exec(line)
      while (m !== null) {
        // Dedupe identical column hits from overlapping-looking rules.
        const key = `${rule.physical}@${m.index}`
        if (!seen.has(key)) {
          seen.add(key)
          violations.push({
            file: rel,
            line: idx + 1,
            column: m.index + 1,
            physical: rule.physical,
            logical: rule.logical,
          })
        }
        if (m.index === rule.re.lastIndex) rule.re.lastIndex++
        m = rule.re.exec(line)
      }
    }
  })

  return violations
}

function escapeCell(text) {
  return String(text).replace(/\|/g, '\\|')
}

function main() {
  const files = collectFiles(SRC_DIR, [])
  const all = []
  for (const file of files) all.push(...scanFile(file))

  // Sort by file, then line, then column for stable output.
  all.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)

  const byToken = new Map()
  for (const v of all) byToken.set(v.physical, (byToken.get(v.physical) || 0) + 1)
  const filesWithHits = new Set(all.map((v) => v.file)).size

  const now = new Date().toISOString().slice(0, 10)
  const out = []
  out.push('# RTL physical-property violations')
  out.push('')
  out.push('Auto-generated by `scripts/rtl-lint.mjs` (run: `node scripts/rtl-lint.mjs`).')
  out.push('The app is Hebrew RTL (dir=rtl). Physical CSS directions break RTL and')
  out.push('should be replaced with logical properties that flip automatically.')
  out.push('')
  out.push('## Summary')
  out.push('')
  out.push(`- Generated: ${now}`)
  out.push(`- Files scanned: ${files.length}`)
  out.push(`- Files with violations: ${filesWithHits}`)
  out.push(`- Total violations: ${all.length}`)
  out.push('')
  if (byToken.size > 0) {
    out.push('### By token')
    out.push('')
    out.push('| Physical | Count |')
    out.push('| --- | --- |')
    for (const [tok, count] of [...byToken.entries()].sort((a, b) => b[1] - a[1])) {
      out.push(`| \`${escapeCell(tok)}\` | ${count} |`)
    }
    out.push('')
  }
  out.push('## Violations')
  out.push('')
  if (all.length === 0) {
    out.push('No violations found. Everything uses logical properties.')
  } else {
    out.push('| File | Line | Physical | Logical replacement |')
    out.push('| --- | --- | --- | --- |')
    for (const v of all) {
      out.push(
        `| ${escapeCell(v.file)} | ${v.line} | \`${escapeCell(v.physical)}\` | \`${escapeCell(v.logical)}\` |`,
      )
    }
  }
  out.push('')

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, out.join('\n'), 'utf8')

  console.log(
    `rtl-lint: ${all.length} violation(s) across ${filesWithHits} file(s); scanned ${files.length} file(s).`,
  )
  console.log(`Report written to ${path.relative(REPO_ROOT, OUT_FILE)}`)
}

main()
