import { createHash } from 'node:crypto'
import forge from 'node-forge'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AppleWalletConfig } from './config'
import { buildManifest, buildPkpass, signManifest } from './pkpass'
import { readZip } from './zip'

/**
 * There is no Apple Pass Type ID certificate on this machine, so what is
 * verified here is everything up to Apple's trust decision: that the archive
 * opens, that the manifest covers exactly the payload with the digests Apple
 * specifies, and that the signature is a detached PKCS#7 that VERIFIES — and
 * stops verifying the moment a byte of the manifest moves.
 *
 * The certificate is generated in the test rather than checked in. A fixture
 * key in a repo is a key, and this one would sit next to a file whose whole
 * job is to explain how passes are signed.
 */

/**
 * `@types/node-forge` does not expose `rawCapture`, which is where the parsed
 * SignedData fields live and the only way to inspect a detached signature
 * without a trust store. Declared here rather than cast at each use.
 */
type SignedDataWithCapture = forge.pkcs7.PkcsSignedData & {
  rawCapture: {
    content?: unknown
    authenticatedAttributes: forge.asn1.Asn1[]
    signature: string
  }
}

let config: AppleWalletConfig
let signerCertificate: forge.pki.Certificate

function selfSigned(commonName: string): {
  certificate: forge.pki.Certificate
  keys: forge.pki.rsa.KeyPair
} {
  // 1024 bits: this key exists for the length of one test file and nothing is
  // trusted on the strength of it. 2048 costs seconds per run for no assertion.
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const certificate = forge.pki.createCertificate()
  certificate.publicKey = keys.publicKey
  certificate.serialNumber = '01'
  certificate.validity.notBefore = new Date(0)
  certificate.validity.notAfter = new Date(4102444800000) // 2100-01-01
  const attrs = [{ name: 'commonName', value: commonName }]
  certificate.setSubject(attrs)
  certificate.setIssuer(attrs)
  certificate.sign(keys.privateKey, forge.md.sha256.create())
  return { certificate, keys }
}

beforeAll(() => {
  const signer = selfSigned('KenyonExpress Test Pass Type ID')
  const intermediate = selfSigned('Test WWDR')
  signerCertificate = signer.certificate
  config = {
    passTypeIdentifier: 'pass.test.kenyonexpress.coupon',
    teamIdentifier: 'TEAM123456',
    organizationName: 'KenyonExpress',
    certificatePem: forge.pki.certificateToPem(signer.certificate),
    privateKeyPem: forge.pki.privateKeyToPem(signer.keys.privateKey),
    privateKeyPassphrase: null,
    wwdrCertificatePem: forge.pki.certificateToPem(intermediate.certificate),
  }
})

const IMAGES = [
  { name: 'icon.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { name: 'logo.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]) },
]
const PASS = { formatVersion: 1, serialNumber: 'v-1' }

describe('buildManifest', () => {
  it('is SHA-1 per file, lowercase hex, keyed by name', () => {
    const manifest = buildManifest(IMAGES)
    expect(manifest['icon.png']).toBe(
      createHash('sha1')
        .update(IMAGES[0]?.data as Buffer)
        .digest('hex'),
    )
    expect(Object.keys(manifest)).toEqual(['icon.png', 'logo.png'])
  })
})

describe('buildPkpass', () => {
  it('produces an archive with pass.json, the images, a manifest and a signature', () => {
    const entries = readZip(buildPkpass({ pass: PASS, images: IMAGES }, config))
    expect(entries.map((e) => e.name)).toEqual([
      'pass.json',
      'icon.png',
      'logo.png',
      'manifest.json',
      'signature',
    ])
  })

  it('leaves nothing in the archive that the manifest does not cover', () => {
    // The failure this guards is silent on a phone: iOS refuses a pass that
    // contains a file the manifest does not mention, with no message the
    // customer or the log can see.
    const entries = readZip(buildPkpass({ pass: PASS, images: IMAGES }, config))
    const manifest = JSON.parse(
      entries.find((e) => e.name === 'manifest.json')?.data.toString('utf8') as string,
    ) as Record<string, string>

    const payload = entries.filter((e) => e.name !== 'manifest.json' && e.name !== 'signature')
    expect(Object.keys(manifest).sort()).toEqual(payload.map((e) => e.name).sort())
    for (const entry of payload) {
      expect(manifest[entry.name]).toBe(createHash('sha1').update(entry.data).digest('hex'))
    }
  })

  it('signs detached: the signature does not carry the manifest a second time', () => {
    const entries = readZip(buildPkpass({ pass: PASS, images: IMAGES }, config))
    const signature = entries.find((e) => e.name === 'signature')?.data as Buffer
    const p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(signature.toString('binary'))),
    ) as SignedDataWithCapture

    expect(p7.rawCapture.content).toBeUndefined()
    // Both the signer and the intermediate travel with the pass; the phone does
    // not go and fetch the chain.
    expect(p7.certificates).toHaveLength(2)
  })

  it('produces a signature that verifies against the manifest, and stops on one edited byte', () => {
    const manifest = Buffer.from(JSON.stringify(buildManifest(IMAGES)), 'utf8')
    const signature = signManifest(manifest, config)

    expect(verifyDetached(signature, manifest)).toBe(true)

    const tampered = Buffer.from(manifest)
    tampered[tampered.length - 2] = tampered[tampered.length - 2] === 0x61 ? 0x62 : 0x61
    expect(verifyDetached(signature, tampered)).toBe(false)
  })

  it('is byte-identical across two builds of the same voucher', () => {
    // Frozen signing time and frozen zip timestamps together. Wallet replaces
    // by serial number, so a re-download must be the same pass and not a new one.
    const a = buildPkpass({ pass: PASS, images: IMAGES }, config)
    const b = buildPkpass({ pass: PASS, images: IMAGES }, config)
    expect(a.equals(b)).toBe(true)
  })

  it('refuses a private key it cannot read rather than emitting an unsigned pass', () => {
    expect(() =>
      buildPkpass(
        { pass: PASS, images: IMAGES },
        { ...config, privateKeyPem: 'not a key', privateKeyPassphrase: 'x' },
      ),
    ).toThrow()
  })
})

/**
 * Recomputes the signed attributes' message digest and checks the RSA signature
 * over them, which is what a verifier does before it ever looks at trust.
 *
 * Written out rather than using `p7.verify()`: node-forge's verify insists on a
 * trust store, and trust is exactly the part this machine cannot supply.
 */
function verifyDetached(signature: Buffer, content: Buffer): boolean {
  const p7 = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(forge.util.createBuffer(signature.toString('binary'))),
  ) as SignedDataWithCapture

  const authenticated = p7.rawCapture.authenticatedAttributes as forge.asn1.Asn1[]
  const digest = forge.md.sha256.create()
  digest.update(content.toString('binary'))
  const expected = digest.digest().getBytes()

  // The messageDigest attribute must equal the digest of the detached content.
  const found = authenticated.some((attr) => {
    const value = attr as unknown as { value: forge.asn1.Asn1[] }
    const oid = forge.asn1.derToOid((value.value[0] as { value: string }).value)
    if (oid !== forge.pki.oids.messageDigest) return false
    const set = value.value[1] as { value: { value: string }[] }
    return set.value[0]?.value === expected
  })
  if (!found) return false

  // And the signature must be over the DER of that attribute set.
  const attributeSet = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    authenticated,
  )
  const signed = forge.md.sha256.create()
  signed.update(forge.asn1.toDer(attributeSet).getBytes())
  const publicKey = signerCertificate.publicKey as forge.pki.rsa.PublicKey
  return publicKey.verify(signed.digest().getBytes(), p7.rawCapture.signature as string)
}
