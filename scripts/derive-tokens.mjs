/**
 * Derive the token set from the measurement. Nothing here invents a value.
 *
 * Reads refs/ke_live_computed.json (every element at rest, all three widths)
 * and refs/ke_live_states.json (hover / active / disabled, measured with a
 * real pointer), and reports:
 *
 *   1. the button token set, with the source selector for every value
 *   2. the product-card anatomy: which elements exist, in what order, with
 *      their measured spacing
 *   3. the global border-radius scale, by frequency
 *   4. the hero structure: slider or static, slide count, aspect per width
 *
 * Every reported value carries the selector and the width it came from, so
 * `docs/TOKEN-PROVENANCE.md` can be filled in without a single guess. Where a
 * value is not present in the measurement the report says UNMEASURED and the
 * exit code is non-zero, so a missing state fails loudly instead of being
 * quietly rounded to something plausible.
 *
 *   node scripts/derive-tokens.mjs
 *   node scripts/derive-tokens.mjs --json > refs/derived.json
 */
import { existsSync, readFileSync } from 'node:fs'

const asJson = process.argv.includes('--json')
const log = (...a) => {
  if (!asJson) console.log(...a)
}

if (!existsSync('refs/ke_live_computed.json')) {
  console.error('refs/ke_live_computed.json is missing. Run scripts/measure-live-computed.mjs first.')
  process.exit(2)
}
const dump = JSON.parse(readFileSync('refs/ke_live_computed.json', 'utf8'))
const states = existsSync('refs/ke_live_states.json')
  ? JSON.parse(readFileSync('refs/ke_live_states.json', 'utf8'))
  : null

const PROPS = dump.meta.properties
const prop = (capture, element, name) => capture.styles[element.s][PROPS.indexOf(name)]

/** Every element of every capture, with its capture label attached. */
function* all() {
  for (const [label, capture] of Object.entries(dump.captures)) {
    for (const element of capture.elements) yield { label, capture, element }
  }
}

const has = (element, ...names) => {
  const classes = (element.c ?? '').split(/\s+/)
  return names.some((n) => classes.includes(n))
}

const problems = []
const report = { meta: dump.meta, buttons: {}, radius: {}, card: {}, hero: {} }

// ---------------------------------------------------------------------------
// 1. Border-radius scale
// ---------------------------------------------------------------------------
log('\n=== 1. BORDER-RADIUS SCALE (all captures, all widths) ===\n')
{
  const counts = new Map()
  const example = new Map()
  for (const { label, capture, element } of all()) {
    const value = prop(capture, element, 'border-radius')
    counts.set(value, (counts.get(value) ?? 0) + 1)
    if (!example.has(value)) example.set(value, `${label}  ${element.p}`)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const total = ranked.reduce((s, [, n]) => s + n, 0)
  log(`${total} elements, ${ranked.length} distinct radius values\n`)
  log('count'.padStart(7), ' value'.padEnd(26), 'first seen')
  for (const [value, count] of ranked.slice(0, 20)) {
    log(String(count).padStart(7), ` ${value}`.padEnd(26), example.get(value))
  }
  report.radius = {
    total,
    distinct: ranked.length,
    ranked: ranked.map(([value, count]) => ({ value, count, example: example.get(value) })),
  }
}

// ---------------------------------------------------------------------------
// 2. Buttons
// ---------------------------------------------------------------------------
log('\n\n=== 2. BUTTON TOKEN SET ===\n')
{
  const BUTTONISH = [
    'single_add_to_cart_button',
    'add_to_cart_button',
    'checkout-button',
    'button',
    'wc-forward',
  ]
  const found = new Map()
  for (const { label, capture, element } of all()) {
    const isButton =
      element.t === 'button' ||
      (element.t === 'input' && /submit/.test(element.c ?? '')) ||
      has(element, ...BUTTONISH)
    if (!isButton) continue
    const key = `${(element.c ?? element.t).split(/\s+/).slice(0, 3).join('.')}`
    const row = {
      label,
      selector: element.p,
      classes: element.c,
      text: element.x,
      bg: prop(capture, element, 'background-color'),
      ink: prop(capture, element, 'color'),
      radius: prop(capture, element, 'border-radius'),
      borderWidth: prop(capture, element, 'border-width'),
      padding: prop(capture, element, 'padding'),
      fontSize: prop(capture, element, 'font-size'),
      fontWeight: prop(capture, element, 'font-weight'),
      height: element.r[3],
      width: element.r[2],
    }
    if (!found.has(key)) found.set(key, [])
    found.get(key).push(row)
  }
  const brandButtons = []
  for (const [key, rows] of found) {
    const first = rows[0]
    if (first.height === 0) continue
    log(`${key}`)
    log(
      `    bg ${first.bg}  ink ${first.ink}  radius ${first.radius}  pad ${first.padding}` +
        `  ${first.fontSize}/${first.fontWeight}  ${first.width}x${first.height}`,
    )
    log(`    ${first.label}  ${first.selector}`)
    if (first.text) log(`    text: ${first.text}`)
    log('')
    if (/254,\s*215,\s*0/.test(first.bg)) brandButtons.push({ key, ...first })
  }
  report.buttons.rest = [...found.entries()].map(([key, rows]) => ({ key, rows }))
  report.buttons.brand = brandButtons

  log('--- interaction states ---\n')
  if (!states) {
    log('  UNMEASURED: refs/ke_live_states.json is absent.')
    log('  Run scripts/measure-live-states.mjs. hover/active/disabled CANNOT be')
    log('  derived from the rest dump and must not be guessed.')
    problems.push('button hover/active/disabled: refs/ke_live_states.json absent')
  } else {
    for (const [label, s] of Object.entries(states.states)) {
      if (!s.found) {
        log(`  ${label}: ABSENT on live (${s.error ?? 'selector matched nothing'})`)
        continue
      }
      const cell = (state, p) => (state ? state[p] : 'UNMEASURED')
      log(`  ${label}  (${s.matches} match${s.matches === 1 ? '' : 'es'})`)
      log(`      rest     bg ${cell(s.rest, 'background-color')}  ink ${cell(s.rest, 'color')}  radius ${cell(s.rest, 'border-radius')}`)
      log(`      hover    bg ${cell(s.hover, 'background-color')}  ink ${cell(s.hover, 'color')}  radius ${cell(s.hover, 'border-radius')}`)
      log(`      active   bg ${cell(s.active, 'background-color')}  ink ${cell(s.active, 'color')}`)
      log(
        `      disabled ${s.disabled ? `bg ${s.disabled['background-color']}  ink ${s.disabled.color}  opacity ${s.disabled.opacity}` : 'UNMEASURED (live paints no disabled instance of this control)'}`,
      )
      if (s.rest) {
        log(
          `      pad ${s.rest.padding}  min-h ${s.rest['min-height']}  h ${s.rest.__rect[3]}  ${s.rest['font-size']}/${s.rest['font-weight']}  transition ${s.rest.transition}`,
        )
      }
      if (!s.active) problems.push(`${label}: active state UNMEASURED`)
      if (!s.disabled) problems.push(`${label}: disabled state UNMEASURED (no disabled instance on live)`)
      log('')
    }
    report.buttons.states = states.states
  }
}

// ---------------------------------------------------------------------------
// 3. Product-card anatomy
// ---------------------------------------------------------------------------
log('\n=== 3. PRODUCT-CARD ANATOMY ===\n')
{
  for (const label of ['category@1440', 'category@768', 'category@380', 'shop@1440']) {
    const capture = dump.captures[label]
    if (!capture) continue
    const cards = capture.elements.filter((e) => e.t === 'li' && has(e, 'product'))
    if (cards.length === 0) {
      log(`${label}: no li.product found`)
      continue
    }
    const first = cards[0]
    log(`${label}: ${cards.length} cards, first at [${first.r.join(', ')}]`)
    // Everything geometrically inside the first card, in document order, which
    // is what "in what order" means for a card.
    const [cx, cy, cw, ch] = first.r
    const inside = capture.elements.filter((e) => {
      const [x, y, w, h] = e.r
      return (
        e !== first &&
        w > 0 &&
        h > 0 &&
        x >= cx - 1 &&
        y >= cy - 1 &&
        x + w <= cx + cw + 1 &&
        y + h <= cy + ch + 1
      )
    })
    log(`  ${'tag.class'.padEnd(38)} ${'rect'.padEnd(30)} size/weight  colour`)
    for (const e of inside.slice(0, 24)) {
      const name = `${e.t}${e.c ? `.${e.c.split(/\s+/).slice(0, 2).join('.')}` : ''}`.slice(0, 37)
      log(
        `  ${name.padEnd(38)} ${`[${e.r.join(', ')}]`.padEnd(30)} ` +
          `${prop(capture, e, 'font-size')}/${prop(capture, e, 'font-weight')}  ${prop(capture, e, 'color')}` +
          (e.x ? `   "${e.x.slice(0, 24)}"` : ''),
      )
    }
    // Vertical rhythm between direct children: the measured spacing.
    log('\n  vertical gaps between consecutive boxes (measured, not margins):')
    const sorted = [...inside].sort((a, b) => a.r[1] - b.r[1])
    let previous = null
    for (const e of sorted.slice(0, 14)) {
      if (previous) {
        const gap = Math.round((e.r[1] - (previous.r[1] + previous.r[3])) * 100) / 100
        const from = `${previous.t}${previous.c ? `.${previous.c.split(/\s+/)[0]}` : ''}`.slice(0, 26)
        const to = `${e.t}${e.c ? `.${e.c.split(/\s+/)[0]}` : ''}`.slice(0, 26)
        log(`    ${from.padEnd(28)} -> ${to.padEnd(28)} ${gap}px`)
      }
      previous = e
    }
    report.card[label] = { count: cards.length, cardRect: first.r, children: inside.slice(0, 24) }
    log('')
  }
}

// ---------------------------------------------------------------------------
// 4. Hero structure
// ---------------------------------------------------------------------------
log('\n=== 4. HERO STRUCTURE ===\n')
{
  for (const width of dump.meta.widths) {
    const capture = dump.captures[`home@${width}`]
    if (!capture) continue
    const modules = capture.elements.filter((e) => e.t === 'rs-module' || e.t === 'rs-module-wrap')
    const slides = capture.elements.filter((e) => e.t === 'rs-slide')
    const bullets = capture.elements.filter((e) => e.t === 'rs-bullet')
    const masks = capture.elements.filter((e) => e.t === 'rs-mask-wrap')
    const module = modules.find((m) => m.r[2] > 0 && m.r[3] > 0) ?? modules[0]
    log(`home@${width}`)
    log(`  rs-module        ${modules.length}  ${module ? `[${module.r.join(', ')}]` : ''}`)
    log(`  rs-slide         ${slides.length}   <- slide count`)
    log(`  rs-bullet        ${bullets.length}`)
    log(`  rs-mask-wrap     ${masks.length}  ${masks[0] ? `[${masks[0].r.join(', ')}]` : ''}`)
    log(`  kind             ${slides.length > 1 ? 'SLIDER' : slides.length === 1 ? 'SINGLE SLIDE (static in effect)' : 'NO REVSLIDER (static)'}`)
    if (module && module.r[3] > 0) {
      log(`  aspect           ${module.r[2]} x ${module.r[3]} = ${(module.r[2] / module.r[3]).toFixed(4)}`)
      log(`  slide bg         ${slides[0] ? prop(capture, slides[0], 'background-color') : 'n/a'}`)
    }
    report.hero[`home@${width}`] = {
      modules: modules.length,
      slides: slides.length,
      bullets: bullets.length,
      moduleRect: module?.r ?? null,
      aspect: module && module.r[3] > 0 ? +(module.r[2] / module.r[3]).toFixed(4) : null,
    }
    log('')
  }
}

// ---------------------------------------------------------------------------
log('\n=== UNMEASURED / FAIL LOUDLY ===\n')
if (problems.length === 0) {
  log('  none: every value the brief asks for was measured.')
} else {
  for (const p of problems) log(`  ! ${p}`)
  log('\n  These MUST be written into docs/TOKEN-PROVENANCE.md as UNMEASURED.')
  log('  Do not invent a value for any of them.')
}
report.problems = problems

if (asJson) process.stdout.write(JSON.stringify(report, null, 2))
process.exit(problems.length > 0 ? 1 : 0)
