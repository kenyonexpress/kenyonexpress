/**
 * Whether this deployment can mint wallet passes, answered per platform.
 *
 * Both platforms need a credential that cannot live in the repo: Apple wants a
 * Pass Type ID certificate and private key (plus the WWDR intermediate) to sign
 * the manifest, Google wants an Issuer service account to sign the save JWT.
 * Neither is on the machine this was written on.
 *
 * That makes this the same shape as Resend, Sentry, Meilisearch and QStash
 * here: configured is a question, not an assumption. The rule the rest of the
 * code follows from it is that an UNCONFIGURED platform renders no button at
 * all. A "הוסף ל-Apple Wallet" button that answers 500 is worse than no button,
 * because the customer has no way to tell that the coupon page still works.
 *
 * The certificate is read as base64 rather than as a path. Vercel has no
 * filesystem to put a .p12 on, and a PEM pasted into an env var loses its
 * newlines in half the tools that touch it on the way.
 */

export interface AppleWalletConfig {
  /** `pass.type` identifier, e.g. `pass.co.kenyonexpress.coupon`. */
  passTypeIdentifier: string
  teamIdentifier: string
  organizationName: string
  /** Signing certificate, PEM. */
  certificatePem: string
  /** Its private key, PEM. */
  privateKeyPem: string
  /** Passphrase for the private key, if it is encrypted. */
  privateKeyPassphrase: string | null
  /** Apple WWDR intermediate, PEM. Included in the PKCS#7 chain. */
  wwdrCertificatePem: string
}

export interface GoogleWalletConfig {
  issuerId: string
  /** Service account email, the JWT `iss`. */
  serviceAccountEmail: string
  /** Service account private key, PEM. */
  privateKeyPem: string
  /** `<issuerId>.<suffix>` names the class every voucher pass belongs to. */
  classSuffix: string
}

/**
 * base64 in, PEM out.
 *
 * Accepts a value that is ALREADY PEM as well, because that is what somebody
 * pasting from a terminal will produce and the failure mode otherwise is a
 * decode that silently yields garbage rather than an error.
 */
function decodePem(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  if (raw.includes('-----BEGIN')) return raw.replace(/\\n/g, '\n')
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8')
    return decoded.includes('-----BEGIN') ? decoded : null
  } catch {
    return null
  }
}

function trimmed(value: string | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

export function readAppleWalletConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppleWalletConfig | null {
  const passTypeIdentifier = trimmed(env.APPLE_WALLET_PASS_TYPE_ID)
  const teamIdentifier = trimmed(env.APPLE_WALLET_TEAM_ID)
  const certificatePem = decodePem(env.APPLE_WALLET_CERT_PEM)
  const privateKeyPem = decodePem(env.APPLE_WALLET_KEY_PEM)
  const wwdrCertificatePem = decodePem(env.APPLE_WALLET_WWDR_PEM)

  // All five or nothing. A pass signed with four of them is not a pass that
  // half works; it is one iOS refuses with no diagnostic the customer can read.
  if (
    !passTypeIdentifier ||
    !teamIdentifier ||
    !certificatePem ||
    !privateKeyPem ||
    !wwdrCertificatePem
  ) {
    return null
  }

  return {
    passTypeIdentifier,
    teamIdentifier,
    organizationName: trimmed(env.APPLE_WALLET_ORG_NAME) ?? 'KenyonExpress',
    certificatePem,
    privateKeyPem,
    privateKeyPassphrase: trimmed(env.APPLE_WALLET_KEY_PASSPHRASE),
    wwdrCertificatePem,
  }
}

export function readGoogleWalletConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleWalletConfig | null {
  const issuerId = trimmed(env.GOOGLE_WALLET_ISSUER_ID)
  const serviceAccountEmail = trimmed(env.GOOGLE_WALLET_SA_EMAIL)
  const privateKeyPem = decodePem(env.GOOGLE_WALLET_SA_KEY_PEM)
  if (!issuerId || !serviceAccountEmail || !privateKeyPem) return null

  return {
    issuerId,
    serviceAccountEmail,
    privateKeyPem,
    classSuffix: trimmed(env.GOOGLE_WALLET_CLASS_SUFFIX) ?? 'kenyon_voucher',
  }
}

export function isAppleWalletConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readAppleWalletConfig(env) !== null
}

export function isGoogleWalletConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readGoogleWalletConfig(env) !== null
}
