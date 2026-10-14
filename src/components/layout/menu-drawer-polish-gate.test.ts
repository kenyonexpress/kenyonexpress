import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UX04, THE CATEGORY PANEL AND THE OFF-CANVAS DRAWER, held to what was read
 * off refs/ke_live_home.html's stylesheet on 14.10.2026 and to the before-state
 * in logs/ux04/before.json:
 *
 *   paper    the open drawer measured background-color rgba(0,0,0,0): the
 *            class was `bg-drawer`, which no token generates. The token is
 *            `--color-drawer-bg`, so the utility is `bg-drawer-bg`.
 *   edge     `.off-canvas-navigation.light{border-left:1px solid #e3e9ef}`,
 *            the inner edge, which is inline-END in RTL -> `border-e`
 *   motion   `transition:all .2s` on the panel and on the scrim, UA `ease`
 *   scrim    `rgba(0,0,0,.7)`; and `inert` while closed, so a full-viewport
 *            button at opacity 0 is not in the tree or the hit test
 *   toggle   `.light .navbar-toggler{color:#333e48}`, `:hover{color:#000}`
 *   rows     `padding:0 1.387em` of 14px = 19.4px, `color:#4b566b`, rules
 *            #e3e9ef, hover `#ebebeb` + `#000`
 *   panel    the hero sidebar's nav is a named landmark; the sticky header is
 *            scroll padding so a focused row is not scrolled under it
 *
 * Each is a class or a token a later "tidy" can undo without failing a build;
 * this is the build failure. What the browser does with them is
 * e2e/menu-drawer.spec.ts.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')
const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const DRAWER = 'src/components/layout/MobileDrawer.tsx'
const SIDEBAR = 'src/components/home/HeroCategorySidebar.tsx'
const GLOBALS = 'src/app/globals.css'
const TOKENS_CSS = 'src/styles/tokens.css'
const TOKENS_TS = 'src/styles/tokens.ts'

/** The drawer's three className strings, by the element they belong to. */
function drawerParts() {
  const src = code(read(DRAWER))
  const classes = [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (m) => m[1] ?? m[2] ?? '',
  )
  const trigger = classes.find((c) => c.includes('size-touch-min') && c.includes('xl:hidden')) ?? ''
  const scrim = classes.find((c) => c.includes('fixed inset-0')) ?? ''
  const panel = classes.find((c) => c.includes('w-drawer-mobile')) ?? ''
  const titleRow = classes.find((c) => c.includes('justify-between')) ?? ''
  const closeButton = classes.find((c) => c.includes('-me-2')) ?? ''
  const row = classes.find((c) => c.includes('h-drawer-row') && c.includes('text-sm')) ?? ''
  return { src, trigger, scrim, panel, titleRow, closeButton, row }
}

describe('the drawer panel', () => {
  const { panel } = drawerParts()

  it("paints live's paper through the token that exists, not a class that resolves to nothing", () => {
    expect(panel).toContain('bg-drawer-bg')
    // Not `\b`: the hyphen in `bg-drawer-bg` is a word boundary too.
    expect(panel).not.toMatch(/(^|\s)bg-drawer(\s|$)/)
  })

  it('carries the 1px #e3e9ef hairline on its inner (inline-end) edge', () => {
    expect(panel).toContain('border-e')
    expect(panel).toContain('border-drawer-border')
  })

  it('slides over 200ms on the UA ease curve, like live, and keeps reduced motion', () => {
    expect(panel).toContain('duration-200')
    expect(panel).toContain('ease-drawer')
    expect(panel).toContain('motion-reduce:transition-none')
    expect(panel).not.toContain('duration-300')
  })

  it('has a thin scrollbar through the one class the stylesheet keeps for it', () => {
    expect(panel).toContain('drawer-panel')
    expect(read(GLOBALS)).toMatch(/\.drawer-panel\s*\{[^}]*scrollbar-width:\s*thin/)
  })
})

describe('the scrim', () => {
  const { src, scrim } = drawerParts()

  it("is 70% black over 200ms, live's rgba(0,0,0,.7) and .2s", () => {
    expect(scrim).toContain('bg-black/70')
    expect(scrim).toContain('duration-200')
    expect(scrim).toContain('ease-drawer')
    expect(scrim).not.toContain('bg-black/50')
  })

  it('is inert while the drawer is closed', () => {
    // The scrim button is the one carrying the aria-label and the fixed class;
    // its JSX must set inert from the open state exactly as the panel does.
    const scrimJsx =
      src.match(/<button[^>]*aria-label="סגירת התפריט"[^>]*fixed inset-0[\s\S]*?\/>/)?.[0] ?? ''
    expect(scrimJsx, 'the scrim button').not.toBe('')
    expect(scrimJsx).toContain('inert={!open}')
  })
})

describe('the toggle and the close button', () => {
  const { trigger, closeButton } = drawerParts()

  it('rest on the heading colour and hover to black, a colour and not an opacity fade', () => {
    for (const cls of [trigger, closeButton]) {
      expect(cls).toContain('text-heading')
      expect(cls).toContain('hover:text-ink')
      expect(cls).toContain('transition-colors')
      expect(cls).not.toContain('opacity-70')
      expect(cls).not.toContain('text-icon')
    }
  })

  it('keep the 44px hit area around the painted glyph', () => {
    expect(trigger).toContain('size-touch-min')
    expect(closeButton).toContain('size-touch-min')
  })
})

describe('the drawer rows', () => {
  const { titleRow, row } = drawerParts()

  it("are inset by live's 1.387em of 14px, through the token", () => {
    expect(row).toContain('px-drawer-pad')
    expect(titleRow).toContain('px-drawer-pad')
    expect(row).not.toContain('px-gutter')
    expect(read(TOKENS_CSS)).toMatch(/--spacing-drawer-pad:\s*19\.4px;/)
  })

  it('read #4b566b on #e3e9ef rules and hover to #ebebeb + black', () => {
    expect(row).toContain('text-drawer-text')
    expect(row).toContain('border-drawer-border')
    expect(row).toContain('hover:bg-drawer-hover')
    expect(row).toContain('hover:text-ink')
    expect(row).toContain('focus-visible:bg-drawer-hover')
    expect(row).toContain('transition-colors')
    expect(row).not.toContain('hover:bg-surface-hover')
    expect(row).not.toContain('border-border')
    expect(titleRow).toContain('border-drawer-border')
  })

  it("keep live's 50px row", () => {
    expect(row).toContain('h-drawer-row')
    expect(read(TOKENS_CSS)).toMatch(/--spacing-drawer-row:\s*50px;/)
  })
})

describe('the drawer tokens', () => {
  const css = read(TOKENS_CSS)
  const ts = read(TOKENS_TS)

  it.each([
    ['--color-drawer-bg', '#fdfcfc'],
    ['--color-drawer-border', '#e3e9ef'],
    ['--color-drawer-text', '#4b566b'],
    ['--color-drawer-hover', '#ebebeb'],
  ])("%s is live's %s in both token files", (name, value) => {
    expect(css).toMatch(new RegExp(`${name}:\\s*${value};`))
    expect(ts).toContain(`'${name}'`)
  })

  it('declares the UA ease curve the drawer and the scrim run on', () => {
    expect(css).toMatch(/--ease-drawer:\s*ease;/)
  })
})

describe('the category panel', () => {
  const src = code(read(SIDEBAR))

  it('names its nav landmark in Hebrew', () => {
    const nav = src.match(/<nav[^>]*>/)?.[0] ?? ''
    expect(nav).toMatch(/aria-label="[^"]*\p{Script=Hebrew}[^"]*"/u)
  })

  it('tints and bolds a row under the pointer and under keyboard focus, as live does', () => {
    const link = src.match(/<Link[\s\S]*?className="([^"]*)"/)?.[1] ?? ''
    expect(link).toContain('hover:bg-surface-hover')
    expect(link).toContain('hover:font-bold')
    expect(link).toContain('focus-visible:bg-surface-hover')
    expect(link).toContain('focus-visible:font-bold')
    expect(link).toContain('transition-colors')
  })
})

describe('the sticky header as scroll padding', () => {
  const css = read(GLOBALS)

  it('pads focus- and anchor-scrolling by the header height at both header sizes', () => {
    expect(css).toMatch(
      /html\s*\{[^}]*scroll-padding-top:\s*calc\(var\(--spacing-header-handheld\) \+ 1px\)/,
    )
    expect(css).toMatch(
      /@media \(min-width: 1280px\)\s*\{\s*html\s*\{\s*scroll-padding-top:\s*calc\(var\(--spacing-header-masthead\) \+ 1px\)/,
    )
  })
})
