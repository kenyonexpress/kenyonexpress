/**
 * Universal / App Links: the two files a phone fetches from this origin to
 * decide whether `https://kenyonexpress.co.il/product/…` opens in the app.
 *
 * The identifiers come from `apps/mobile/app.json` and are repeated here as
 * constants rather than read from that file: the site is deployed without the
 * mobile workspace, and an app id is an identity that does not change.
 *
 * What is NOT here is anything secret or guessable: the Android signing
 * certificate fingerprint and the Apple Team ID are env-driven, and until they
 * are set both routes answer 404. A file with a placeholder fingerprint is not
 * "almost configured", it is a verification that fails on the device with a
 * cache the OS keeps for a day.
 */

export const ANDROID_PACKAGE = 'co.il.kenyonexpress.app'
export const IOS_BUNDLE_ID = 'co.il.kenyonexpress.app'

/** Mirrors the `intentFilters` in apps/mobile/app.json, as AASA path patterns. */
export const DEEP_LINK_PATHS = ['/account/*', '/checkout/*', '/product/*'] as const

const FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/

/** "AA:BB:…" values, comma or whitespace separated; anything malformed is refused whole. */
export function parseFingerprints(raw: string | undefined | null): string[] | null {
  const parts = (raw ?? '')
    .split(/[\s,]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
  if (parts.length === 0) return null
  if (!parts.every((p) => FINGERPRINT.test(p))) return null
  return [...new Set(parts)]
}

const TEAM_ID = /^[A-Z0-9]{10}$/

export function parseTeamId(raw: string | undefined | null): string | null {
  const value = (raw ?? '').trim().toUpperCase()
  return TEAM_ID.test(value) ? value : null
}

export function buildAssetLinks(fingerprints: readonly string[]) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: [...fingerprints],
      },
    },
  ]
}

export function buildAppleAppSiteAssociation(teamId: string) {
  const appID = `${teamId}.${IOS_BUNDLE_ID}`
  return {
    applinks: {
      // Modern (iOS 13+) shape. `details[].appIDs` with `components`, and the
      // legacy `paths` beside it for the handful of older devices still around.
      apps: [],
      details: [
        {
          appIDs: [appID],
          components: DEEP_LINK_PATHS.map((path) => ({ '/': path })),
          paths: [...DEEP_LINK_PATHS],
        },
      ],
    },
    webcredentials: { apps: [appID] },
  }
}
