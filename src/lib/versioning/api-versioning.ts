/**
 * API version negotiation (MEGA 193). Pure, no I/O.
 *
 * WHAT THIS IS NOT. The first draft of this module was a `fetch` wrapper that
 * built `/api/v${version}${endpoint}` and returned `.json()`. There is no such
 * route in this repo -- `src/app/api/` has no `v1` segment anywhere -- so that
 * function could only ever have produced a 404 parsed as JSON. Rather than
 * invent a routing tier nothing serves, this resolves which version a caller
 * asked for and lets the route decide. Adoption is one `resolveApiVersion` call
 * per handler, whenever a second version actually exists.
 *
 * Negotiation order, most explicit first:
 *   1. a version segment in the path      -- /api/v1/cart
 *   2. the `X-API-Version` request header  -- v1, or bare 1
 *   3. CURRENT_API_VERSION
 *
 * A caller that names a version we do not serve is NOT silently downgraded:
 * `supported: false` comes back and the route is expected to answer 400. Silent
 * downgrade is how a client ships against v2 semantics and gets v1 answers.
 */

/** Every version this deployment serves, oldest first. */
export const API_VERSIONS = ['v1'] as const

export type ApiVersion = (typeof API_VERSIONS)[number]

/** What an unversioned caller gets. Always the last entry of API_VERSIONS. */
export const CURRENT_API_VERSION: ApiVersion = API_VERSIONS[API_VERSIONS.length - 1] as ApiVersion

/** Header a client sets to pin a version without changing its URLs. */
export const API_VERSION_HEADER = 'x-api-version'

export type VersionSource = 'path' | 'header' | 'default'

export interface ResolvedApiVersion {
  /** The version to serve, or the caller's unknown request when unsupported. */
  version: string
  /** Where the answer came from. `default` means the caller said nothing. */
  source: VersionSource
  /** False when the caller named a version outside API_VERSIONS. */
  supported: boolean
}

/**
 * Normalises `1`, `v1`, `V1`, ` v1 ` to `v1`. Returns null for anything else,
 * including `v01` and `v1.2`: a version is a `v` and one or more digits with no
 * leading zero, so there is exactly one spelling of each version in logs.
 */
export function parseApiVersion(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim().toLowerCase()
  if (trimmed.length === 0) return null
  const match = /^v?([1-9]\d*)$/.exec(trimmed)
  return match ? `v${match[1]}` : null
}

export function isSupportedApiVersion(version: string): version is ApiVersion {
  return (API_VERSIONS as readonly string[]).includes(version)
}

/**
 * Reads the version out of a pathname's first `/api/<v>` segment.
 *
 * Anchored on `/api/` deliberately: a product slug like `/category/v2-cables`
 * is not a version, and a bare first-segment scan would read it as one.
 */
export function versionFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const match = /(?:^|\/)api\/(v?[0-9]+)(?:\/|$)/i.exec(pathname)
  return match ? parseApiVersion(match[1]) : null
}

export interface VersionRequestLike {
  pathname?: string | null
  /** Any header bag: a Headers instance, or a plain record. */
  headers?: Headers | Record<string, string | string[] | undefined> | null
}

function readHeader(headers: VersionRequestLike['headers'], name: string): string | null {
  if (!headers) return null
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name)
  }
  // A plain record can be keyed any way the caller spelled it. HTTP header
  // names are case-insensitive, so `X-API-Version` and `x-api-version` are the
  // same header and a direct lookup on one spelling silently misses the other.
  const bag = headers as Record<string, string | string[] | undefined>
  const wanted = name.toLowerCase()
  for (const key of Object.keys(bag)) {
    if (key.toLowerCase() !== wanted) continue
    const hit = bag[key]
    if (Array.isArray(hit)) return hit[0] ?? null
    return hit ?? null
  }
  return null
}

export function resolveApiVersion(request: VersionRequestLike): ResolvedApiVersion {
  const fromPath = versionFromPath(request.pathname)
  if (fromPath) {
    return { version: fromPath, source: 'path', supported: isSupportedApiVersion(fromPath) }
  }

  const rawHeader = readHeader(request.headers, API_VERSION_HEADER)
  if (rawHeader != null && rawHeader.trim().length > 0) {
    const fromHeader = parseApiVersion(rawHeader)
    // An unparseable header is a caller error, not an absent preference. It is
    // reported as unsupported so it cannot be mistaken for "said nothing".
    const version = fromHeader ?? rawHeader.trim()
    return {
      version,
      source: 'header',
      supported: fromHeader != null && isSupportedApiVersion(version),
    }
  }

  return { version: CURRENT_API_VERSION, source: 'default', supported: true }
}

/**
 * Response headers announcing what was actually served. Sent on every versioned
 * answer, including the 400 for an unsupported request, so a client can see the
 * gap between what it asked for and what exists.
 */
export function apiVersionHeaders(served: string = CURRENT_API_VERSION): Record<string, string> {
  return {
    'X-API-Version': served,
    'X-API-Supported-Versions': API_VERSIONS.join(', '),
  }
}

/**
 * Orders two versions numerically: -1, 0, 1. Throws on an unparseable input.
 *
 * NUMERICALLY, NOT LEXICOGRAPHICALLY, and this is the whole reason the function
 * exists. `'v10' < 'v9'` is true in JavaScript, so a string comparison decides
 * that v10 is older than v9 and quietly runs every legacy transform against a
 * current payload. One `<` on two version strings is all it takes.
 */
export function compareApiVersions(a: string, b: string): -1 | 0 | 1 {
  const left = parseApiVersion(a)
  const right = parseApiVersion(b)
  if (left == null) throw new TypeError(`not an api version: ${a}`)
  if (right == null) throw new TypeError(`not an api version: ${b}`)
  const ln = Number.parseInt(left.slice(1), 10)
  const rn = Number.parseInt(right.slice(1), 10)
  if (ln < rn) return -1
  return ln > rn ? 1 : 0
}
