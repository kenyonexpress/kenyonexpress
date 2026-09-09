import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The saved Cardcom token must never leave the server.
 *
 * WHAT `payment_tokens.cardcom_token` ACTUALLY IS. It is not a card number and
 * the table holds no PAN: the columns are `last_4`, `card_brand`,
 * `expiry_month`, `expiry_year`. But the token is a REUSABLE CHARGING
 * CREDENTIAL. Anything that can present it to Cardcom can bill that card, which
 * is exactly what `chargeWithToken` does in checkout.
 *
 * WHY A GATE. Every read that renders a card for a human already selects a
 * narrow column list, on purpose. Nothing enforces it. `select('*')` is the
 * shortest edit in the file and it is not a bug that shows: the page looks
 * identical, and the token rides along in the RSC payload of a page served to a
 * browser. It would sit in the HTML, in the browser cache, and in any proxy
 * along the way.
 *
 * The rule is therefore about the SURFACE, not the column: a file that renders
 * to a browser may not name `cardcom_token` and may not select `*` from that
 * table. Server-only paths that must present the token to Cardcom are listed
 * and each is checked for what makes it legitimate.
 */

/**
 * Files that reach a browser: pages, layouts and client components.
 *
 * `src/app/api` is excluded and that is not a hole. A route handler returns a
 * Response it composed itself and never renders into a document, so the whole
 * failure mode this gate exists for — a value riding along in an RSC payload
 * nobody looked at — cannot happen there. The cron worker that charges
 * subscriptions has to hold the token to charge with it, and it is listed in
 * SERVER_ONLY below rather than waved through.
 */
const RENDERED_ROOTS = ['src/app', 'src/components']
const NOT_RENDERED = /^src\/app\/api\//

/**
 * Server-only files that legitimately handle the token, each with the reason
 * and the marker that proves it is still that file.
 */
const SERVER_ONLY: Record<string, { because: string; mustContain: string | RegExp }> = {
  'src/server/payments/finalize.ts': {
    because: 'writes the token when Cardcom returns one; the only writer',
    // Matched with whitespace tolerance: biome splits the builder chain across
    // lines, and the invariant is "this file inserts payment_tokens", not
    // "this file formats the call on one line".
    mustContain: /from\('payment_tokens'\)\s*\.insert\(/,
  },
  'src/server/actions/payments/checkout.ts': {
    because: 'reads the token to charge a returning customer, server side only',
    mustContain: "from('payment_tokens')",
  },
  'src/app/api/cron/subscriptions/route.ts': {
    because:
      'the recurring-billing worker, which cannot charge a subscription without the token. Reached by Vercel Cron with a bearer secret and never by a browser.',
    mustContain: 'bearerMatches',
  },
}

function walk(dir: string): string[] {
  let found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found = found.concat(walk(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full)
  }
  return found
}

function renderedFiles(): string[] {
  const cwd = process.cwd()
  return RENDERED_ROOTS.flatMap((root) => walk(resolve(cwd, root)))
    .map((file) => relative(cwd, file).split('\\').join('/'))
    .filter((file) => !NOT_RENDERED.test(file))
}

/** Comments discuss the token at length. Only real code counts. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

describe('the saved card surface', () => {
  const rendered = renderedFiles()

  it('finds the rendered trees at all', () => {
    expect(rendered.length).toBeGreaterThan(100)
  })

  it('no page or component names cardcom_token', () => {
    // The token has no reason to appear in anything that renders. Naming it is
    // either a select that carries it into the RSC payload or a render that
    // puts it on screen.
    const offenders = rendered.filter((file) =>
      codeOnly(readFileSync(resolve(process.cwd(), file), 'utf8')).includes('cardcom_token'),
    )
    expect(
      offenders,
      'a rendered file names cardcom_token. That token can charge the card; it must not reach a browser.',
    ).toEqual([])
  })

  it('no read of payment_tokens selects everything', () => {
    // `select('*')` is the shortest edit that leaks it, and the page looks
    // exactly the same afterwards.
    const offenders: string[] = []
    for (const file of rendered) {
      const code = codeOnly(readFileSync(resolve(process.cwd(), file), 'utf8'))
      if (!code.includes("from('payment_tokens')")) continue
      if (/from\('payment_tokens'\)[\s\S]{0,80}?\.select\(\s*['"`]\*/.test(code)) {
        offenders.push(file)
      }
    }
    expect(offenders, 'select(*) on payment_tokens carries the charging token with it').toEqual([])
  })

  it('the account read lists its columns and the token is not among them', () => {
    const code = readFileSync(resolve(process.cwd(), 'src/server/queries/account.ts'), 'utf8')
    const select = code.match(/from\('payment_tokens'\)\s*\.select\(([^)]*)\)/)?.[1] ?? ''
    expect(select, 'the account read no longer names its columns').not.toBe('')
    expect(select).not.toContain('cardcom_token')
    expect(select).not.toContain('*')
    expect(select).toContain('last_4')
  })

  it.each(Object.entries(SERVER_ONLY))(
    '%s is still the server-only path it is allowed to be',
    (file, allowance) => {
      // An allowlisted file rewritten into something else stops being covered by
      // its own reason, so the reason is checked rather than trusted.
      const code = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(code, `${file} is allowed because it ${allowance.because}`).toMatch(
        allowance.mustContain,
      )
      expect(code.startsWith("'use client'"), `${file} became a client component`).toBe(false)
      expect(file.includes('/page.') || file.includes('/layout.'), `${file} became a page`).toBe(
        false,
      )
    },
  )

  it('the table itself holds no card number', () => {
    // The generated types are measured from production. A PAN column appearing
    // here is a schema change nobody should make.
    const types = readFileSync(resolve(process.cwd(), 'src/types/database.ts'), 'utf8')
    const block = types.slice(types.indexOf('payment_tokens: {'))
    const row = block.slice(0, block.indexOf('Insert:'))
    for (const forbidden of ['card_number', 'pan', 'full_number', 'cvv', 'cvc']) {
      expect(row.toLowerCase(), `payment_tokens gained a ${forbidden} column`).not.toContain(
        forbidden,
      )
    }
    expect(row).toContain('last_4')
  })
})
