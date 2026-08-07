import { createHash } from 'node:crypto'
import forge from 'node-forge'
import type { AppleWalletConfig } from './config'
import { type ZipEntry, buildZip } from './zip'

/**
 * A `.pkpass` is a ZIP of `pass.json`, its images, a `manifest.json` of SHA-1
 * digests, and a detached PKCS#7 signature over that manifest.
 *
 * The two things that make it refuse to open on a phone, both silent:
 *
 *   1. A file in the archive that is not in the manifest, or a digest that does
 *      not match. So the manifest is DERIVED from the entries here rather than
 *      passed in — there is no way to add a file and forget it.
 *   2. SHA-1. It is the algorithm Apple specifies for the manifest, it is not a
 *      choice, and it is not a security boundary either: the PKCS#7 signature
 *      over the manifest is what makes the archive tamper-evident, and that one
 *      is SHA-256 under the Pass Type ID certificate.
 *
 * Nothing here can be exercised end to end on a machine without an Apple
 * Developer Pass Type ID certificate, and this one does not have one. What IS
 * verified in the tests: the archive opens, the manifest covers exactly the
 * payload files with correct digests, the signature is a detached PKCS#7 that
 * verifies against a certificate generated in the test, and a tampered manifest
 * fails that verification.
 */

export interface PkpassInput {
  /** Already-built `pass.json` object. */
  pass: Record<string, unknown>
  /** `icon.png`, `logo.png`, … Apple requires at least `icon.png`. */
  images: readonly ZipEntry[]
}

/** Apple's manifest: file name -> lowercase hex SHA-1 of its bytes. */
export function buildManifest(entries: readonly ZipEntry[]): Record<string, string> {
  const manifest: Record<string, string> = {}
  for (const entry of entries) {
    manifest[entry.name] = createHash('sha1').update(entry.data).digest('hex')
  }
  return manifest
}

const OID = {
  contentType: forge.pki.oids.contentType as string,
  data: forge.pki.oids.data as string,
  messageDigest: forge.pki.oids.messageDigest as string,
  signingTime: forge.pki.oids.signingTime as string,
  sha256: forge.pki.oids.sha256 as string,
}

/**
 * Fixed rather than `new Date()`, for the same reason the ZIP timestamps are:
 * the same voucher must produce the same bytes twice, so a pass re-downloaded
 * after a refresh is byte-identical and Wallet replaces it in place. Apple does
 * not check this attribute's value; it checks that it is present.
 */
const SIGNING_TIME = new Date(0)

/**
 * Detached PKCS#7 (CMS) SignedData over the manifest bytes.
 *
 * `detached` is the whole point: the signature file must NOT embed the manifest
 * again, or the archive carries the payload twice and iOS rejects the size
 * mismatch. The WWDR intermediate is added to the chain because the phone
 * validates up to the Apple Root CA and does not fetch intermediates.
 */
export function signManifest(manifest: Buffer, config: AppleWalletConfig): Buffer {
  const certificate = forge.pki.certificateFromPem(config.certificatePem)
  const wwdr = forge.pki.certificateFromPem(config.wwdrCertificatePem)
  const privateKey = config.privateKeyPassphrase
    ? forge.pki.decryptRsaPrivateKey(config.privateKeyPem, config.privateKeyPassphrase)
    : forge.pki.privateKeyFromPem(config.privateKeyPem)
  if (!privateKey) {
    throw new Error('apple wallet: private key could not be read (wrong passphrase?)')
  }

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(manifest.toString('binary'))
  p7.addCertificate(certificate)
  p7.addCertificate(wwdr)
  p7.addSigner({
    key: privateKey as forge.pki.rsa.PrivateKey,
    certificate,
    digestAlgorithm: OID.sha256,
    // `@types/node-forge` types every OID lookup as `string | undefined` and
    // `signingTime`'s value as a string. Both are wrong about this library:
    // the OIDs are literals in its own table, and forge's signer passes a Date
    // through `asn1.dateToUtcTime`. Narrowed here rather than worked around,
    // because the alternative is inventing OID strings by hand.
    authenticatedAttributes: [
      { type: OID.contentType, value: OID.data },
      // `value` is filled in by forge from the content at sign time. Passing
      // one here would sign a digest of something else.
      { type: OID.messageDigest },
      { type: OID.signingTime, value: SIGNING_TIME as unknown as string },
    ],
  })
  p7.sign({ detached: true })

  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
}

/**
 * The finished archive.
 *
 * Entry order is `pass.json`, images, `manifest.json`, `signature`, which is
 * both what Apple's own tooling emits and the order the dependencies run in.
 */
export function buildPkpass(input: PkpassInput, config: AppleWalletConfig): Buffer {
  const payload: ZipEntry[] = [
    // Stable key order and no whitespace: same voucher, same bytes.
    { name: 'pass.json', data: Buffer.from(JSON.stringify(input.pass), 'utf8') },
    ...input.images,
  ]

  const manifest = Buffer.from(JSON.stringify(buildManifest(payload)), 'utf8')
  const signature = signManifest(manifest, config)

  return buildZip([
    ...payload,
    { name: 'manifest.json', data: manifest },
    { name: 'signature', data: signature },
  ])
}
