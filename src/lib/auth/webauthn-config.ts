/**
 * The relying party for passkeys is the site's own host. A passkey made on
 * kenyonexpress.co.il works there only, which is the whole point of WebAuthn.
 */
export function relyingParty(env: NodeJS.ProcessEnv = process.env): {
  rpID: string
  rpName: string
  origin: string
} {
  const raw = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const url = new URL(raw)
  return { rpID: url.hostname, rpName: 'KenyonExpress', origin: url.origin }
}
