/**
 * Physical direction utilities in a right-to-left application, and the three
 * kinds of them that are correct.
 *
 * The document is `<html lang="he" dir="rtl">`. In it, `mr-2` and `ms-2` render
 * identically, `text-right` and `text-start` render identically, and only one
 * of each pair still means what it says if a subtree is ever flipped. So the
 * physical spelling is not a bug today; it is a bug waiting for the first
 * `dir="ltr"` island to grow around it.
 *
 * MEASURED 2026-09-09: 160 logical utilities against 26 physical ones across
 * 19 files. Thirteen of the 26 were rendering-identical and were converted.
 * The other thirteen are correct as they stand, and the reasons are the whole
 * value of this file.
 *
 * 1. INSIDE `dir="ltr"`, PHYSICAL IS THE ONLY CORRECT SPELLING.
 *
 *    `SupplierLeadForm` has three inputs carrying `dir="ltr"` -- a phone, an
 *    email and a URL, which are LTR content inside an RTL form -- and each also
 *    carries `text-right` so the LTR text still aligns with the Hebrew fields
 *    around it. Inside `dir="ltr"`, `start` means LEFT. Converting those three
 *    to `text-start` would left-align all three fields and break the form's
 *    alignment.
 *
 *    A blanket "logical properties everywhere, no left/right" sweep does
 *    exactly that conversion. This is the case that makes the instruction
 *    wrong, and it is why this scan reads the element's own attributes rather
 *    than only its class list.
 *
 * 2. CENTERING IS NOT A DIRECTION. `left-1/2` with `-translate-x-1/2`, and
 *    `right-1/2` with `translate-x-1/2`, are the centering idiom. There is no
 *    logical equivalent and no direction being expressed.
 *
 * 3. AN ALLOWLIST for the handful that are neither, each with its argument.
 *
 * WHAT IT READS. Only `className="..."` and `` className={`...`} `` on the same
 * element as any `dir=` attribute it needs to see, which means a `dir` set on a
 * PARENT is invisible to it. That direction of error is the safe one: it can
 * ask for a conversion that was not needed, and a reviewer then adds a line to
 * the allowlist. It cannot quietly bless a violation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const ROOT = 'src'

/** Physical utilities that have a logical twin. */
const PHYSICAL =
  /^(?:[a-z-]+:)*(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right|float-left|float-right)(?:-[\w./[\]%-]+)?$/

/** The centering idiom: a half-offset that is always paired with a translate. */
const CENTERING = /^(?:[a-z-]+:)*(left|right)-1\/2$/

/**
 * Call sites read in full and found correct. Keyed by file, then by the exact
 * utility, so the same token elsewhere is still caught.
 */
export const REVIEWED = new Map([
  [
    'src/components/ui/dialog.tsx',
    new Map([
      [
        'right-4',
        'The shadcn close button. Physical placement is deliberate: it is pinned to a ' +
          'corner of the dialog box rather than to the start or end of a text flow.',
      ],
    ]),
  ],
  [
    'src/components/ui/dropdown-menu.tsx',
    new Map([
      [
        'left-2',
        'The check indicator well in the shadcn menu primitive, sized to match the ' +
          'item padding it sits inside. Physical and paired with a physical padding.',
      ],
    ]),
  ],
  [
    'src/components/ui/select.tsx',
    new Map([
      [
        'left-2',
        'The same check-indicator well as dropdown-menu.tsx, from the same shadcn ' +
          'primitive, pinned to the item box rather than to a text flow. Both files are ' +
          'vendored upstream code; converting them would diverge this copy from the ' +
          'source it is re-synced against.',
      ],
    ]),
  ],
  [
    'src/components/a11y/SkipLink.tsx',
    new Map([
      [
        'focus:right-4',
        'Pins the focused skip link to the top-RIGHT, which is the reading origin of ' +
          'an RTL document and where a skip link is expected to appear. The component ' +
          "comment says so, and the skip-link test asserts it is not 'left'.",
      ],
    ]),
  ],
  [
    'src/components/home/HeroSlider.tsx',
    new Map([
      [
        'lg:left-[61px]',
        'Positions the slider dots against the measured geometry of the reference ' +
          'design at one breakpoint, not against a text flow.',
      ],
    ]),
  ],
  [
    'src/components/layout/MobileDrawer.tsx',
    new Map([
      [
        'right-0',
        'The drawer is anchored right and translated +100% when closed, and the closed ' +
          'state is `translate-x-full` -- a PHYSICAL transform. Converting the anchor to ' +
          '`end-0` without also making the transform logical would split the pair and ' +
          'slide the drawer off the wrong edge. The component comment states the intent.',
      ],
    ]),
  ],
  [
    'src/components/admin/CouponDealForm.tsx',
    new Map([
      [
        'right-2',
        'A discount badge absolutely positioned in the corner of the image box on an ' +
          'admin preview card, paired with `top-2`. It is pinned to a corner of a box ' +
          'and not placed against a text flow, so `end-2` would assert a relationship ' +
          'to reading direction that this element does not have.',
      ],
    ]),
  ],
])

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, files)
    } else if (['.ts', '.tsx'].includes(extname(entry))) {
      files.push(full)
    }
  }
  return files
}

/**
 * Classifies one utility on one element.
 *
 * Pure, so `rtl-logical-gate.test.mjs` can drive every branch.
 */
export function classifyUtility(token, { file = '', elementHasLtr = false } = {}) {
  if (!PHYSICAL.test(token)) return { ok: true, reason: 'not-physical' }
  if (elementHasLtr) return { ok: true, reason: 'inside-dir-ltr' }
  if (CENTERING.test(token)) return { ok: true, reason: 'centering-idiom' }
  if (REVIEWED.get(file)?.has(token)) return { ok: true, reason: 'reviewed' }
  return { ok: false, reason: 'physical-in-an-rtl-document' }
}

/**
 * The element a className belongs to, approximated as the text from the opening
 * `<` before it up to the className. That is where a sibling `dir="ltr"` lives.
 */
function elementHasLtr(source, classNameIndex) {
  const open = source.lastIndexOf('<', classNameIndex)
  if (open === -1) return false
  return /\bdir=(?:"ltr"|\{'ltr'\}|\{"ltr"\})/.test(source.slice(open, classNameIndex))
}

export function scanRtlLogical(root = ROOT) {
  const offenders = []
  for (const file of walk(root)) {
    if (/\.test\.tsx?$/.test(file)) continue
    const source = readFileSync(file, 'utf8')
    if (!source.includes('className')) continue
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = match[1] ?? match[2] ?? ''
      const ltr = elementHasLtr(source, match.index)
      for (const token of classes.split(/\s+/).filter(Boolean)) {
        const { ok, reason } = classifyUtility(token, { file, elementHasLtr: ltr })
        if (!ok) {
          const line = source.slice(0, match.index).split('\n').length
          offenders.push({ file, line, token, reason })
        }
      }
    }
  }
  return offenders
}

export function formatRtlLogical(offenders) {
  return offenders.map((o) => `  ${o.file}:${o.line}  ${o.token}`).join('\n')
}
