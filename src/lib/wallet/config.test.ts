import { describe, expect, it } from 'vitest'
import {
  isAppleWalletConfigured,
  isGoogleWalletConfigured,
  readAppleWalletConfig,
  readGoogleWalletConfig,
} from './config'

const CERT = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----'
const KEY = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----'

/**
 * `NodeJS.ProcessEnv` requires NODE_ENV, and these fixtures deliberately carry
 * only the wallet keys: the point of each case is which of them is missing.
 */
function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

function appleEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return env({
    APPLE_WALLET_PASS_TYPE_ID: 'pass.co.kenyonexpress.coupon',
    APPLE_WALLET_TEAM_ID: 'TEAM123456',
    APPLE_WALLET_CERT_PEM: Buffer.from(CERT).toString('base64'),
    APPLE_WALLET_KEY_PEM: Buffer.from(KEY).toString('base64'),
    APPLE_WALLET_WWDR_PEM: Buffer.from(CERT).toString('base64'),
    ...overrides,
  })
}

describe('readAppleWalletConfig', () => {
  it('reads a complete configuration', () => {
    const config = readAppleWalletConfig(appleEnv())
    expect(config?.certificatePem).toBe(CERT)
    expect(config?.organizationName).toBe('KenyonExpress')
  })

  it('accepts a PEM pasted in directly, not only base64', () => {
    // What somebody copying out of a terminal will actually paste. Decoding it
    // as base64 would yield bytes that are not a certificate, and forge would
    // fail later with a message about ASN.1 rather than about configuration.
    const config = readAppleWalletConfig(appleEnv({ APPLE_WALLET_CERT_PEM: CERT }))
    expect(config?.certificatePem).toBe(CERT)
  })

  it('restores newlines that an env editor turned into backslash-n', () => {
    const escaped = CERT.replace(/\n/g, '\\n')
    const config = readAppleWalletConfig(appleEnv({ APPLE_WALLET_CERT_PEM: escaped }))
    expect(config?.certificatePem).toBe(CERT)
  })

  it('is all five or nothing', () => {
    // Four of five does not sign a pass that half works; it signs one iOS
    // refuses with nothing the customer can read.
    for (const missing of [
      'APPLE_WALLET_PASS_TYPE_ID',
      'APPLE_WALLET_TEAM_ID',
      'APPLE_WALLET_CERT_PEM',
      'APPLE_WALLET_KEY_PEM',
      'APPLE_WALLET_WWDR_PEM',
    ]) {
      expect(readAppleWalletConfig(appleEnv({ [missing]: undefined }))).toBeNull()
    }
  })

  it('treats whitespace as absence', () => {
    expect(readAppleWalletConfig(appleEnv({ APPLE_WALLET_TEAM_ID: '   ' }))).toBeNull()
  })

  it('rejects a value that decodes to something which is not a PEM', () => {
    expect(
      readAppleWalletConfig(
        appleEnv({ APPLE_WALLET_CERT_PEM: Buffer.from('hello').toString('base64') }),
      ),
    ).toBeNull()
  })

  it('answers the configured question without throwing on an empty env', () => {
    expect(isAppleWalletConfigured(env({}))).toBe(false)
  })
})

describe('readGoogleWalletConfig', () => {
  const complete = env({
    GOOGLE_WALLET_ISSUER_ID: '3388000000000000000',
    GOOGLE_WALLET_SA_EMAIL: 'wallet@example.iam.gserviceaccount.com',
    GOOGLE_WALLET_SA_KEY_PEM: Buffer.from(KEY).toString('base64'),
  })

  it('reads a complete configuration and defaults the class suffix', () => {
    const config = readGoogleWalletConfig(complete)
    expect(config?.issuerId).toBe('3388000000000000000')
    expect(config?.classSuffix).toBe('kenyon_voucher')
  })

  it('is null without the service account key', () => {
    expect(
      readGoogleWalletConfig(env({ ...complete, GOOGLE_WALLET_SA_KEY_PEM: undefined })),
    ).toBeNull()
    expect(isGoogleWalletConfigured(env({}))).toBe(false)
  })
})
