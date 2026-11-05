import { createHmac } from 'node:crypto'

/**
 * RFC 6238 TOTP for the E2E admin fixture (G6, 05.11.2026): the admin gate
 * now forces aal2 for `admin`, so the suite's admin sign-in has to finish the
 * challenge. SHA-1, 6 digits, 30 s, base32 secret: the defaults GoTrue issues.
 * Written here rather than adding otplib: twenty lines, no dependency, and it
 * is only ever fed the fixture's own secret from the shell
 * (E2E_ADMIN_TOTP_SECRET).
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function totpCode(secretBase32: string, nowMs: number = Date.now(), step = 30): string {
  const counter = Math.floor(nowMs / 1000 / step)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest()
  const offset = (digest[digest.length - 1] as number) & 0x0f
  const bin =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}
