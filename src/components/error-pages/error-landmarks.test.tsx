import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn(),
  captureException: vi.fn(),
}))

import { SegmentErrorBoundary } from '../errors/SegmentErrorBoundary'
import ErrorPageFrame from './ErrorPageFrame'
import NotFoundPage from './NotFoundPage'

/**
 * S33: ONE <main> PER PAGE, ALSO WHEN THE PAGE IS AN ERROR.
 *
 * Measured 06.11.2026 with axe on /product/<unknown>: landmark-main-is-top-level,
 * landmark-no-duplicate-main and landmark-unique. The 404 frame is a <main>,
 * which is right for a URL that matches no route (it is the whole document),
 * and it was rendering inside the store layout's own <main>. The per-group
 * error.tsx had the same shape. So inside a group both render a <div>, and
 * the root documents keep the landmark.
 *
 * Also here: the code digits. Brand yellow on white measured 1.4:1 (axe:
 * color-contrast, serious); they are heading ink over a yellow band now.
 */

const APP = resolve(process.cwd(), 'src/app')

function walk(dir: string, name: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...walk(full, name))
    else if (entry === name) found.push(full)
  }
  return found
}

/** A real call, not a mention in a comment. */
function callsNotFound(source: string): boolean {
  return source
    .split('\n')
    .some((line) => /\bnotFound\(\)/.test(line) && !/^\s*(\*|\/\/|\/\*)/.test(line))
}

const groups = readdirSync(APP)
  .filter((entry) => entry.startsWith('(') && entry.endsWith(')'))
  .filter((entry) => statSync(join(APP, entry)).isDirectory())
  .sort()

describe('error documents and the main landmark', () => {
  it('ErrorPageFrame is a <main> on its own and a <div> when asked', () => {
    const alone = render(<ErrorPageFrame title="א" text="ב" actions={null} />)
    expect(alone.container.querySelector('main.ke-error-page')).not.toBeNull()
    alone.unmount()

    const inside = render(<ErrorPageFrame as="div" title="א" text="ב" actions={null} />)
    expect(inside.container.querySelector('main')).toBeNull()
    expect(inside.container.querySelector('div.ke-error-page')?.getAttribute('dir')).toBe('rtl')
  })

  it('NotFoundPage keeps its three ways out in either shape', () => {
    for (const as of ['main', 'div'] as const) {
      const { container, unmount } = render(<NotFoundPage as={as} />)
      const hrefs = [...container.querySelectorAll('.ke-error-page__actions a')].map((a) =>
        a.getAttribute('href'),
      )
      expect(hrefs).toEqual(['/products', '/products?view=categories', '/'])
      expect(container.querySelector('h1')?.textContent).toBe('הדף שחיפשתם לא נמצא')
      unmount()
    }
  })

  it('the root 404 keeps the landmark: for an unmatched URL it is the document', () => {
    const source = readFileSync(join(APP, 'not-found.tsx'), 'utf8')
    expect(source).toContain('<NotFoundPage />')
    expect(source).toMatch(/robots: \{ index: false/)
  })

  it('every group whose layout has a <main> and whose pages call notFound() has its own 404', () => {
    const missing: string[] = []
    for (const group of groups) {
      const dir = join(APP, group)
      let layout: string
      try {
        layout = readFileSync(join(dir, 'layout.tsx'), 'utf8')
      } catch {
        continue
      }
      if (!layout.includes('<main')) continue
      const throws = walk(dir, 'page.tsx').some((page) => callsNotFound(readFileSync(page, 'utf8')))
      if (!throws) continue
      try {
        const source = readFileSync(join(dir, 'not-found.tsx'), 'utf8')
        if (!source.includes('<NotFoundPage as="div" />')) missing.push(`${group} (not a div)`)
      } catch {
        missing.push(group)
      }
    }
    expect(missing, 'groups that would nest a <main> on a 404').toEqual([])
  })

  it('a segment error boundary is a <div> unless the group has no layout', () => {
    const props = {
      error: new Error('x'),
      reset: () => {},
      boundary: 'store',
      title: 'א',
      body: 'ב',
      homeHref: '/',
      homeLabel: 'ג',
    }
    const inside = render(<SegmentErrorBoundary {...props} />)
    expect(inside.container.querySelector('main')).toBeNull()
    expect(inside.container.firstElementChild?.getAttribute('dir')).toBe('rtl')
    inside.unmount()

    const top = render(<SegmentErrorBoundary {...props} landmark />)
    expect(top.container.querySelector('main')).not.toBeNull()
  })

  it('asks for the landmark exactly where no layout supplies one', () => {
    for (const group of groups) {
      let source: string
      try {
        source = readFileSync(join(APP, group, 'error.tsx'), 'utf8')
      } catch {
        continue
      }
      if (!source.includes('SegmentErrorBoundary')) continue
      let hasLayout = true
      try {
        statSync(join(APP, group, 'layout.tsx'))
      } catch {
        hasLayout = false
      }
      expect(/^\s*landmark$/m.test(source), `${group}/error.tsx`).toBe(!hasLayout)
    }
  })

  it('prints the code in heading ink, not in the brand yellow', () => {
    const sheet = readFileSync(resolve(process.cwd(), 'src/styles/error-pages.css'), 'utf8')
    const rule = sheet.match(/\.ke-error-page__code \{([^}]+)\}/)?.[1] ?? ''
    expect(rule).toMatch(/color: var\(--ke-err-heading\)/)
    expect(rule).not.toMatch(/color: var\(--ke-err-primary\)/)

    const global = readFileSync(join(APP, 'global-error.tsx'), 'utf8')
    expect(global).toMatch(/color: HEADING,\s+boxShadow: `inset 0 -0\.36em 0 \$\{PRIMARY\}`/)
  })
})
