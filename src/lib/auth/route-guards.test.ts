import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every privileged route proves who is calling, in its own file.
 *
 * WHY A SOURCE SCAN RATHER THAN A REQUEST TEST. The guards are
 * `redirect()`-based server functions; exercising them for real needs a running
 * Next server, a Supabase session and a seeded role per case, which is the E2E
 * suite's job and takes minutes. What actually goes wrong in this repo is
 * simpler and cheaper to catch: somebody adds a page under `(admin)` and forgets
 * the guard line. That already happened once -- `/admin/products` shipped
 * relying on the layout alone, which let `support` (a role explicitly denied the
 * catalog in `lib/admin/permissions.ts`) list every product. A file scan is the
 * only test that fails the moment such a file appears.
 *
 * WHAT THE LAYOUT DOES NOT DO. `(admin)/layout.tsx` calls `requirePanelSession`,
 * which proves panel ENTRY and nothing else -- support, content_uploader and
 * admin all pass it. Section access is decided per page. So "the layout covers
 * it" is not a defence, and this test deliberately does not accept one.
 */

const ROOTS = ['src/app/(admin)', 'src/app/(supplier)', 'src/app/api/admin', 'src/app/api/supplier']

/** Anything that establishes the caller's identity AND their authority. */
const GUARDS = [
  // lib/admin/rbac.ts
  'requireAdminSession',
  'requireStaffSession',
  'requireAdminPage',
  'requirePanelSession',
  'requireSection',
  'getSessionWithRole',
  // lib/supplier/rbac.ts
  'requireSupplierMember',
  'requireSupplierRole',
  'getSupplierSession',
  'getSupplierMemberships',
  // lib/supabase/bearer.ts — the till app authenticates by bearer token, not by
  // cookie, so its routes cannot use the redirect guards. Returning null for an
  // unauthenticated caller is the same decision in a different shape.
  'identityScopedClient',
]

/**
 * Files that legitimately carry no guard. Each needs a reason, and the reason is
 * checked: the entry names the substring that must appear in the file, so an
 * allowlisted file that is later rewritten into something else fails here.
 */
const EXEMPT: Record<string, { because: string; mustContain: string }> = {
  'src/app/(supplier)/supplier/scan/page.tsx': {
    because: 'pure redirect to /scan, which is guarded; it reads nothing itself',
    mustContain: "redirect('/scan')",
  },
  'src/app/api/supplier/redeem/route.ts': {
    because: 'alias that re-exports the guarded /api/supplier/vouchers/redeem handler',
    mustContain: "export { POST } from '@/app/api/supplier/vouchers/redeem/route'",
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
    if (/^(page|route|layout)\.tsx?$/.test(entry)) found.push(full)
  }
  return found
}

function routeFiles(): string[] {
  const cwd = process.cwd()
  return ROOTS.flatMap((root) => {
    const abs = resolve(cwd, root)
    try {
      if (!statSync(abs).isDirectory()) return []
    } catch {
      // A root that does not exist is not a silent pass: the count assertion
      // at the bottom is what notices a whole tree going missing.
      return []
    }
    return walk(abs).map((file) => relative(cwd, file).split('\\').join('/'))
  }).sort()
}

/**
 * Comments name guards constantly. Only real code counts as calling one.
 *
 * A SCANNER, NOT A REGEX, AND THE REASON IS A BUG THIS GATE ALREADY HAD.
 *
 * The previous version stripped block comments with
 * `/\/\*[\s\S]*?\*\//g` and then dropped lines beginning with `//`. Both
 * steps are individually reasonable and the ORDER is what breaks: a `/*`
 * sequence inside a LINE comment opens a block comment as far as that regex is
 * concerned, and everything up to the next `*\/` anywhere in the file is
 * deleted.
 *
 * `admin/products/page.tsx` carries the line
 *
 *     // ... while every sibling under /admin/products/* refused them.
 *
 * three lines above `await requireSection('catalog', 'read')`. For as long as
 * that file contained no real block comment there was no closing delimiter, the
 * regex matched nothing, and the gate passed for the wrong reason. Adding one
 * ordinary JSDoc block anywhere below it supplied the partner delimiter, the
 * strip swallowed the guard, and a correctly guarded route reported as
 * unguarded.
 *
 * That direction is noisy and safe. The direction that is not: the same
 * deletion can remove an ENTIRE route body, and a file whose guard was removed
 * for real would look identical. A security gate must not have a mode where a
 * stray character decides how much of the file it reads.
 *
 * So this walks the source once, tracking whether it is inside a line comment,
 * a block comment, a quoted string or a template literal, and blanks comment
 * characters in place. Offsets and line numbers survive, which is what
 * `brand-contrast.test.ts` learned the hard way.
 */
function codeOnly(text: string): string {
  const out: string[] = []
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'

  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    const next = text[i + 1]
    const keep = (ch: string) => out.push(ch)

    switch (mode) {
      case 'code':
        if (c === '/' && next === '/') {
          mode = 'line'
          keep(' ')
        } else if (c === '/' && next === '*') {
          mode = 'block'
          keep(' ')
        } else {
          if (c === "'") mode = 'single'
          else if (c === '"') mode = 'double'
          else if (c === '`') mode = 'template'
          keep(c)
        }
        break
      case 'line':
        if (c === '\n') mode = 'code'
        keep(c === '\n' ? '\n' : ' ')
        break
      case 'block':
        if (c === '*' && next === '/') {
          mode = 'code'
          keep(' ')
          keep(' ')
          i++
          continue
        }
        keep(c === '\n' ? '\n' : ' ')
        break
      default: {
        // Inside a string. A backslash escapes the next character, so a quote
        // it protects cannot be read as the closing one.
        if (c === '\\') {
          keep(c)
          if (next !== undefined) {
            keep(next)
            i++
          }
          break
        }
        const closes =
          (mode === 'single' && c === "'") ||
          (mode === 'double' && c === '"') ||
          (mode === 'template' && c === '`')
        if (closes) mode = 'code'
        keep(c)
      }
    }
  }

  return out.join('')
}

describe('the comment stripper reads code, not delimiters', () => {
  // Every case here is a way the previous regex-pair deleted real code. They
  // are pinned by behaviour rather than described, because the failure they
  // cause is a guard that is present and reported missing -- or, in the other
  // direction, a route body the gate never sees at all.

  it('does not let a /* inside a line comment open a block comment', () => {
    // The exact shape in admin/products/page.tsx. Before the rewrite, the guard
    // below vanished the moment any JSDoc block appeared later in the file.
    const source = [
      '// every sibling under /admin/products/* refused them',
      "const s = await requireSection('catalog', 'read')",
      '/** an ordinary doc comment */',
      'const x = 1',
    ].join('\n')
    expect(codeOnly(source)).toContain('requireSection(')
  })

  it('does not let a // inside a string comment out the rest of the line', () => {
    const source = "const url = 'https://example.com'; await requireAdminSession()"
    expect(codeOnly(source)).toContain('requireAdminSession(')
  })

  it('still removes a guard named only in a comment', () => {
    // The thing the stripper is FOR. Without it, a file that merely mentions a
    // guard in prose passes the gate.
    expect(codeOnly('// this page needs requireAdminSession() one day')).not.toContain(
      'requireAdminSession(',
    )
    expect(codeOnly('/* requireStaffSession() belongs here */')).not.toContain(
      'requireStaffSession(',
    )
  })

  it('preserves line numbers, so an offender is reported where it lives', () => {
    const source = '/*\n a\n b\n*/\nconst x = 1'
    expect(codeOnly(source).split('\n')).toHaveLength(5)
  })
})

describe('privileged routes are guarded', () => {
  const files = routeFiles()

  it('finds the admin and supplier route trees at all', () => {
    // Guards against the scan silently passing because a rename moved every
    // route out from under ROOTS.
    expect(files.length).toBeGreaterThanOrEqual(45)
  })

  it.each(files)('%s calls a guard', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    const exemption = EXEMPT[file]

    if (exemption) {
      expect(source, `${file} is exempt because ${exemption.because}`).toContain(
        exemption.mustContain,
      )
      return
    }

    const code = codeOnly(source)
    const used = GUARDS.filter((guard) => new RegExp(`\\b${guard}\\s*\\(`).test(code))
    expect(
      used,
      `${file} has no authorization check. Call one of: ${GUARDS.join(', ')} — or add it to EXEMPT with a reason.`,
    ).not.toHaveLength(0)
  })

  it('every exemption still points at a file that exists', () => {
    for (const file of Object.keys(EXEMPT)) {
      expect(files, `EXEMPT names ${file}, which the scan no longer sees`).toContain(file)
    }
  })
})
