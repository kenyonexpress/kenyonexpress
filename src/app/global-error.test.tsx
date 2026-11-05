import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * S33: global-error.tsx is the one error document that cannot use
 * ErrorPageFrame or its stylesheet (the root layout that would have loaded
 * them is what failed), so it carries the same look inline. This pins the two
 * together by reading both files: a palette change in error-pages.css that
 * does not reach global-error.tsx fails here instead of shipping one off-brand
 * screen.
 *
 * Read as source, not rendered: the component returns <html> and <body>, which
 * a test renderer cannot mount inside its own document.
 */

const source = readFileSync(resolve(process.cwd(), 'src/app/global-error.tsx'), 'utf8')
const sheet = readFileSync(resolve(process.cwd(), 'src/styles/error-pages.css'), 'utf8')

function sheetValue(name: string): string {
  const match = sheet.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!match?.[1]) throw new Error(`error-pages.css has no ${name}`)
  return match[1].trim()
}

function sourceConst(name: string): string {
  const match = source.match(new RegExp(`const ${name} = '([^']+)'`))
  if (!match?.[1]) throw new Error(`global-error.tsx has no const ${name}`)
  return match[1]
}

describe('global-error.tsx', () => {
  it('supplies its own Hebrew RTL document, with a name', () => {
    expect(source).toMatch(/<html lang="he" dir="rtl">/)
    expect(source).toMatch(/<body/)
    // It cannot export metadata, and the layout that set the title is the one
    // that failed (axe: document-title, serious, before this line existed).
    expect(source).toMatch(/<title>\{t\('errorPages\.errorTitle'\)\}<\/title>/)
  })

  it('carries the palette of the other error pages, value for value', () => {
    expect(sourceConst('PRIMARY')).toBe(sheetValue('--ke-err-primary'))
    expect(sourceConst('HEADING')).toBe(sheetValue('--ke-err-heading'))
    expect(sourceConst('BODY')).toBe(sheetValue('--ke-err-body'))
    expect(sourceConst('RULE')).toBe(sheetValue('--ke-err-rule'))
    expect(sourceConst('SURFACE')).toBe(sheetValue('--ke-err-surface'))
    expect(`${source.match(/const TOUCH = (\d+)/)?.[1]}px`).toBe(sheetValue('--ke-err-touch'))
  })

  it('depends on no stylesheet and no storefront chrome', () => {
    expect(source).not.toMatch(/^import .*\.css'/m)
    expect(source).not.toMatch(/className=/)
    expect(source).not.toMatch(/from '@\/components\//)
    expect(source).not.toMatch(/from 'next\/(link|image)'/)
  })

  it('offers a retry, a way home that needs no router, and support', () => {
    expect(source).toMatch(/onClick=\{reset\}/)
    expect(source).toMatch(/<a\s+href="\/"/)
    expect(source).toContain('mailto:${DEFAULT_CONTACT_EMAIL}')
    expect(source).toContain('https://wa.me/${PUBLISHED_STORE_WHATSAPP}')
    expect(source).toContain('/images/logo.webp')
  })

  it('takes its copy from the catalog the 500 uses, so the two cannot drift', () => {
    for (const key of ['errorTitle', 'errorText', 'retry', 'home', 'supportLead']) {
      expect(source).toContain(`t('errorPages.${key}')`)
    }
    expect(source).not.toMatch(/[֐-׿]/)
  })

  it('reports to Sentry under its own boundary tag', () => {
    expect(source).toMatch(/setTag\('boundary', 'global-error'\)/)
    expect(source).toMatch(/captureException\(error\)/)
  })
})
