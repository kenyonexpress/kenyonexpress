import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ANDROID_PACKAGE,
  DEEP_LINK_PATHS,
  IOS_BUNDLE_ID,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  parseFingerprints,
  parseTeamId,
} from './deep-links'

const FP = `${'AB:'.repeat(31)}AB`

describe('parseFingerprints', () => {
  it('accepts a comma list of SHA-256 fingerprints, normalised to upper case', () => {
    expect(parseFingerprints(`${FP.toLowerCase()}, ${FP}`)).toEqual([FP])
  })
  it('refuses the whole value when one entry is malformed', () => {
    expect(parseFingerprints(`${FP}, not-a-fingerprint`)).toBeNull()
    expect(parseFingerprints('')).toBeNull()
    expect(parseFingerprints(undefined)).toBeNull()
  })
})

describe('parseTeamId', () => {
  it('is ten upper-case alphanumerics or nothing', () => {
    expect(parseTeamId(' abcde12345 ')).toBe('ABCDE12345')
    expect(parseTeamId('TEAMID')).toBeNull()
    expect(parseTeamId(undefined)).toBeNull()
  })
})

describe('the identifiers match the mobile app', () => {
  const app = JSON.parse(readFileSync('apps/mobile/app.json', 'utf8')) as {
    expo: {
      ios: { bundleIdentifier: string }
      android: {
        package: string
        intentFilters: { data: { pathPrefix: string }[] }[]
      }
    }
  }

  it('uses the package and bundle id from apps/mobile/app.json', () => {
    expect(ANDROID_PACKAGE).toBe(app.expo.android.package)
    expect(IOS_BUNDLE_ID).toBe(app.expo.ios.bundleIdentifier)
  })

  it('claims exactly the paths the Android intent filter claims', () => {
    const prefixes = app.expo.android.intentFilters
      .flatMap((f) => f.data.map((d) => `${d.pathPrefix}/*`))
      .sort()
    expect([...DEEP_LINK_PATHS].sort()).toEqual(prefixes)
  })
})

describe('the two documents', () => {
  it('assetlinks carries the handle_all_urls relation and the fingerprints', () => {
    const doc = buildAssetLinks([FP])
    expect(doc[0]?.relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(doc[0]?.target.sha256_cert_fingerprints).toEqual([FP])
    expect(doc[0]?.target.package_name).toBe(ANDROID_PACKAGE)
  })

  it('AASA names TEAMID.bundle and both the modern and legacy path shapes', () => {
    const doc = buildAppleAppSiteAssociation('ABCDE12345')
    const detail = doc.applinks.details[0]
    expect(detail?.appIDs).toEqual(['ABCDE12345.co.il.kenyonexpress.app'])
    expect(detail?.components).toEqual(DEEP_LINK_PATHS.map((p) => ({ '/': p })))
    expect(detail?.paths).toEqual([...DEEP_LINK_PATHS])
    expect(doc.webcredentials.apps).toEqual(['ABCDE12345.co.il.kenyonexpress.app'])
  })
})
