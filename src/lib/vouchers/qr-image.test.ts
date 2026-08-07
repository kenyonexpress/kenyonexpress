import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { buildRedeemUrl, parseScanInput } from '@/lib/vouchers/scan-input'
import { describe, expect, it } from 'vitest'

/**
 * Two invariants about the QR a customer holds up at a counter.
 *
 * The bug these were written for: four screens rendered a voucher QR and three
 * of them encoded the bare `KEV1.<body>.<mac>` payload instead of the redeem
 * URL. The in-app scanner accepts both, so the fault was invisible whenever the
 * counter used /scan, and it surfaced only for a cashier pointing a plain phone
 * camera at the confirmation page of an order the customer had just paid for:
 * a bare KEV1 string is not a URL, so the camera offers to search the web.
 *
 * The rendering itself is not asserted here. `qrcode` produces a PNG data URL
 * and reading a QR back out of it would test that library. What matters is the
 * string that goes in, and that exactly one module decides it.
 */

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('the QR payload target', () => {
  const TOKEN = 'KEV1.eyJjIjoiQUJDREVGR0hKSyJ9.c2lnbmF0dXJl'

  it('encodes a URL the phone camera can open, not the bare token', () => {
    const target = buildRedeemUrl('https://kenyonexpress.co.il', TOKEN)
    expect(target).toBe(`https://kenyonexpress.co.il/redeem/${encodeURIComponent(TOKEN)}`)
    expect(target.startsWith('KEV1.')).toBe(false)
  })

  it('round-trips through the scanner that reads it at the counter', () => {
    const scanned = parseScanInput(buildRedeemUrl('https://kenyonexpress.co.il', TOKEN))
    expect(scanned.kind).toBe('token')
    expect(scanned.token).toBe(TOKEN)
  })
})

describe('one module owns voucher QR rendering', () => {
  /**
   * A source-level invariant rather than a behavioural one, because the failure
   * mode is a new page quietly encoding the payload again. Encoding is allowed
   * in exactly one file, which is the file that also builds the redeem URL.
   */
  it('calls the QR encoder nowhere but lib/vouchers/qr-image.ts', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith('qr-image.ts') && !file.endsWith('qr-image.test.ts'))
      .filter((file) => /QRCode\.toDataURL|from 'qrcode'/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })
})
