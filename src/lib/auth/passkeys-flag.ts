/**
 * Flag `passkeys_enabled` (env `NEXT_PUBLIC_PASSKEYS_ENABLED`, so server and
 * client agree). Default ON: only an explicit `0`/`false`/`off` switches
 * passkeys off, which hides the login button and the post-purchase banner and
 * makes both API routes answer 404.
 */
export function passkeysEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.NEXT_PUBLIC_PASSKEYS_ENABLED?.trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}
