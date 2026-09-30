import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The overview reaches every section the account holds, and the account holds
 * exactly one way to delete itself.
 *
 * Server components are not renderable in this suite, so like
 * coupons/reachable.test.ts these read the routes as source. What was wrong
 * when this was written: the overview linked four of eight sections, the
 * notification switch matrix was rendered by nothing, and /account/details
 * and /account/privacy each carried their own deletion form, backed by two
 * server actions with two confirmation phrases and two erasure lists.
 */

const APP = join(process.cwd(), 'src/app')
const ACCOUNT = join(APP, '(account)/account')
const OVERVIEW = join(ACCOUNT, 'page.tsx')
const NOTIFICATIONS = join(ACCOUNT, 'notifications/page.tsx')
const DETAILS = join(ACCOUNT, 'details/page.tsx')
const PRIVACY = join(ACCOUNT, 'privacy/page.tsx')

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('the overview', () => {
  const overview = code(OVERVIEW)

  it.each([
    '/account/orders',
    '/account/coupons',
    '/account/wallet',
    '/account/cashback',
    '/account/addresses',
    '/account/tokens',
    '/account/notifications',
    '/account/privacy',
  ])('links to %s', (href) => {
    expect(overview).toContain(`href="${href}"`)
  })

  it('summarises through the pure module, not inline arithmetic', () => {
    expect(overview).toContain("from '@/lib/account/overview'")
    expect(overview).toContain('summarizePaymentMethods(')
    expect(overview).toContain('summarizeAddresses(')
    expect(overview).toContain('summarizePreferences(')
  })

  it('shows a card by its masked label and never by a token field', () => {
    expect(overview).toContain('cardLabel(')
    expect(overview).not.toMatch(/cardcom|Token\b/i)
  })
})

describe('the notification switches', () => {
  it('are rendered by the notifications page, from rows read under RLS', () => {
    const page = code(NOTIFICATIONS)
    expect(page).toContain('<PreferenceSwitches rows={rows} />')
    expect(page).toContain('loadPreferences()')
  })
})

describe('account deletion', () => {
  it('has one form, on the privacy page', () => {
    const forms = sourceFiles(ACCOUNT)
      .filter((file) => /DeleteAccount\w*\s*\/>/.test(code(file)))
      .map((file) => relative(process.cwd(), file))
    expect(forms).toEqual([relative(process.cwd(), PRIVACY)])
    expect(code(PRIVACY)).toContain('<DeleteAccountForm />')
  })

  it('is reached from the details page rather than duplicated there', () => {
    const details = code(DETAILS)
    expect(details).toContain('href="/account/privacy"')
    expect(details).not.toContain('DeleteAccountSection')
  })

  it('has one server action and one confirmation word', () => {
    const src = join(process.cwd(), 'src')
    const importers = sourceFiles(src)
      .filter((file) => /lib\/account\/delete-account'|deleteAccount\b/.test(code(file)))
      .map((file) => relative(process.cwd(), file))
    expect(importers).toEqual([])
    expect(code(join(src, 'server/actions/privacy.ts'))).toContain('DELETE_CONFIRM_WORD')
  })
})
