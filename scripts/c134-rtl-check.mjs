#!/usr/bin/env node
/**
 * C134: RTL leak check on / and /product/[slug].
 *
 * Walks the static import graph from the two route entry points (plus the
 * store layout that wraps them) and flags every physical-direction token:
 * Tailwind ml/mr/pl/pr, left-/right-, text-left/right, border-l/r,
 * rounded-l/r/tl/tr/bl/br, float-left/right, and CSS margin-left,
 * padding-right, left:, right:, text-align:left|right, plus dir="ltr".
 * Comment lines are skipped. Locked files are reported separately and never
 * count as fixable.
 *
 * Usage: node scripts/c134-rtl-check.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const ENTRIES = [
  'src/app/(store)/page.tsx',
  'src/app/(store)/layout.tsx',
  'src/app/(store)/product/[slug]/page.tsx',
]
const LOCKED = [
  'src/components/HeroSection.tsx',
  'src/components/HeroSlider.tsx',
  'src/components/TopBar.tsx',
  'src/components/MainHeader.tsx',
  'src/components/Header.tsx',
  'src/app/layout.tsx',
  'src/components/home/HeroSection.tsx',
  'src/components/home/HeroSlider.tsx',
  'src/components/layout/TopBar.tsx',
  'src/components/layout/MainHeader.tsx',
  'src/components/layout/Header.tsx',
]
const LOCKED_DIRS = ['src/components/hero/', 'src/components/header/', 'src/components/topbar/']
const isLocked = (f) => LOCKED.includes(f) || LOCKED_DIRS.some((d) => f.startsWith(d))

const EXT = ['.tsx', '.ts', '.jsx', '.js', '.css', '/index.tsx', '/index.ts']
function resolve(from, spec) {
  let base
  if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
  for (const e of EXT) if (fs.existsSync(base + e)) return base + e
  return null
}

const seen = new Set()
const queue = ENTRIES.map((e) => path.join(ROOT, e))
while (queue.length) {
  const f = queue.pop()
  if (seen.has(f)) continue
  seen.add(f)
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(
    /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g,
  )) {
    const r = resolve(f, m[1] ?? m[2] ?? m[3])
    if (r && !/\.(test|spec)\./.test(r)) queue.push(r)
  }
}

const TOKENS = [
  [/(?<![\w-])-?(?:ml|mr|pl|pr|scroll-ml|scroll-mr)-[\w[.\]/]+/g, 'physical margin/padding'],
  [/(?<![\w-])-?(?:left|right)-[\w[.\]/%-]+/g, 'physical inset'],
  [/(?<![\w-])text-(?:left|right)\b/g, 'physical text-align'],
  [/(?<![\w-])border-[lr](?:-[\w[\]#]+)?\b/g, 'physical border'],
  [/(?<![\w-])rounded-(?:l|r|tl|tr|bl|br)(?:-[\w[\]]+)?\b/g, 'physical radius'],
  [/(?<![\w-])float-(?:left|right)\b/g, 'physical float'],
  [/\b(?:margin|padding|border)-(?:left|right)\s*:/g, 'physical CSS box'],
  [/(?<![\w-])(?:left|right)\s*:\s*['"\d-]/g, 'physical CSS inset'],
  [/text-align\s*:\s*['"]?(?:left|right)/g, 'physical CSS text-align'],
  [
    /\b(?:marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight)\s*:/g,
    'physical style prop',
  ],
]

/**
 * dir="ltr" is NOT a leak on its own: latin-field-direction.test.ts requires it
 * on every email/phone/SKU field, because those strings are Latin. It IS a
 * leak when the LTR element shows Hebrew: Hebrew child text, or a Hebrew
 * placeholder that has not been flipped back with placeholder-shown:[direction:rtl].
 */
const HEBREW = /[\u0590-\u05FF]/
function ltrVerdict(src, idx) {
  const open = src.lastIndexOf('<', idx)
  const selfClose = src.indexOf('/>', idx)
  const close = src.indexOf('>', idx)
  const isSelf = selfClose !== -1 && selfClose <= close
  const tag = src.slice(open, (isSelf ? selfClose : close) + 1)
  const body = isSelf ? '' : src.slice(close + 1, src.indexOf('</', close))
  const ph = /placeholder="([^"]*)"/.exec(tag)?.[1] ?? ''
  if (HEBREW.test(body)) return 'Hebrew text inside dir=ltr'
  if (HEBREW.test(ph) && !tag.includes('placeholder-shown:[direction:rtl]'))
    return 'Hebrew placeholder inside dir=ltr'
  return null
}

const files = [...seen].map((f) => path.relative(ROOT, f)).sort()
const hits = []
for (const rel of files) {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n')
  let inBlock = false
  lines.forEach((line, i) => {
    const t = line.trim()
    if (inBlock) {
      if (t.includes('*/')) inBlock = false
      return
    }
    if (t.startsWith('/*') || t.startsWith('{/*')) {
      if (!t.includes('*/')) inBlock = true
      return
    }
    if (t.startsWith('*') || t.startsWith('//')) return
    for (const [re, kind] of TOKENS) {
      for (const m of line.matchAll(re))
        hits.push({
          rel,
          line: i + 1,
          token: m[0],
          kind,
          locked: isLocked(rel),
          text: t.slice(0, 140),
        })
    }
  })
}
const isolates = []
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  for (const m of src.matchAll(/dir=["']ltr["']/g)) {
    const line = src.slice(0, m.index).split('\n').length
    const text = src.split('\n')[line - 1].trim().slice(0, 140)
    const before = src.slice(0, m.index)
    if (before.lastIndexOf('/*') > before.lastIndexOf('*/') || /^\s*(\/\/|\*)/.test(text)) continue
    const why = ltrVerdict(src, m.index)
    if (why) hits.push({ rel, line, token: m[0], kind: why, locked: isLocked(rel), text })
    else isolates.push(`${rel}:${line}`)
  }
}
const fixable = hits.filter((h) => !h.locked)
const locked = hits.filter((h) => h.locked)
console.log(`files in / + /product render graph: ${files.length}`)
console.log(`physical-direction hits (unlocked): ${fixable.length}`)
console.log(`physical-direction hits (locked, not editable): ${locked.length}`)
console.log(
  `dir="ltr" Latin isolates (email/phone/SKU, required by latin-field-direction.test.ts): ${isolates.length}`,
)
for (const i of isolates) console.log(`  ok ${i}`)
for (const h of fixable) console.log(`LEAK ${h.rel}:${h.line} ${h.token} [${h.kind}] :: ${h.text}`)
for (const h of locked) console.log(`LOCKED ${h.rel}:${h.line} ${h.token} [${h.kind}]`)
process.exit(fixable.length ? 1 : 0)
