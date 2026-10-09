import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * content_uploader stays OUT of discounts, orders and users (marathon step
 * 13) -- and out of everything else that is not catalogue copy.
 *
 * The permission MATRIX is already pinned (permissions.test.ts:
 * content_uploader is 'none' on every section but catalog). What the matrix
 * cannot see is an action module reaching for the WRONG GUARD: one
 * `requireStaffSession()` on a discounts action and the uploader is spending
 * the platform's commission, with the matrix still green. This scan pins the
 * guard-to-module map instead, so that mistake is a failing test and a
 * visible diff.
 */

const ADMIN_ACTIONS = join(process.cwd(), 'src/server/actions/admin')

/**
 * The modules a content_uploader may write through, and the ONLY ones that
 * may use an uploader-admitting guard (requireStaffSession or
 * requireSection('catalog')). Everything here is catalogue copy; money on
 * these paths is stripped/forced-pending by applyUploaderPolicy, which has
 * its own tests.
 */
const UPLOADER_WRITABLE = new Set([
  'categories.ts',
  'images.ts',
  'products.ts',
  'reviews.ts',
  'upload.ts',
  'vouchers.ts', // its catalog half; the redeem half gates on 'orders'
])

const UPLOADER_ADMITTING = /requireStaffSession|requireSection\(\s*'catalog'/

function actionFiles(): string[] {
  return readdirSync(ADMIN_ACTIONS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
}

function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

describe('content_uploader prohibitions', () => {
  const files = actionFiles()

  it('scans a real directory', () => {
    expect(files.length).toBeGreaterThan(15)
  })

  it.each(files)('%s calls a recognised admin guard at all', (file) => {
    const code = codeOnly(readFileSync(join(ADMIN_ACTIONS, file), 'utf8'))
    expect(
      /requireAdminSession|requireStaffSession|requireSection\(/.test(code),
      `${file} has no admin guard -- every admin action must prove its caller`,
    ).toBe(true)
  })

  it.each(files.filter((f) => !UPLOADER_WRITABLE.has(f)))(
    '%s never admits a content_uploader',
    (file) => {
      const code = codeOnly(readFileSync(join(ADMIN_ACTIONS, file), 'utf8'))
      expect(
        UPLOADER_ADMITTING.test(code),
        `${file} uses an uploader-admitting guard. If this module is really catalogue copy, add it to UPLOADER_WRITABLE here with that argument; otherwise use requireAdminSession or requireSection('<its own section>').`,
      ).toBe(false)
    },
  )

  it.each(['discounts.ts', 'orders.ts', 'users.ts'])(
    'the three named prohibitions hold: %s',
    (file) => {
      // Discounts spend the platform's commission; orders and users are other
      // people's money and identity. The uploader writes CONTENT.
      const code = codeOnly(readFileSync(join(ADMIN_ACTIONS, file), 'utf8'))
      expect(UPLOADER_ADMITTING.test(code)).toBe(false)
      expect(/requireAdminSession|requireSection\(/.test(code)).toBe(true)
    },
  )
})
