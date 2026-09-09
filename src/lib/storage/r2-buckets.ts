// Cloudflare R2 bucket registry. Names are constants, not env vars: bucket
// names are part of the infrastructure contract (see infra/cloudflare/r2-setup.md)
// and every environment talks to the same three buckets.
//
// Safe to import from client or server code: names only, no credentials.

export type R2BucketPurpose = 'product-images' | 'coupon-qrcodes' | 'user-uploads' | 'course-videos'

export type R2BucketConfig = {
  /** Actual bucket name in the Cloudflare account. */
  bucket: string
  /**
   * Public buckets are served through the CDN base URL (R2_PUBLIC_BASE_URL).
   * Private buckets are only reachable through signed GET URLs.
   */
  public: boolean
  maxBytes: number
  allowedTypes: readonly string[]
}

export const R2_BUCKETS: Record<R2BucketPurpose, R2BucketConfig> = {
  'product-images': {
    bucket: 'kenyonexpress-product-images',
    public: true,
    maxBytes: 5 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  },
  'coupon-qrcodes': {
    bucket: 'kenyonexpress-coupon-qrcodes',
    public: false,
    maxBytes: 1 * 1024 * 1024,
    allowedTypes: ['image/png', 'image/svg+xml'],
  },
  'user-uploads': {
    bucket: 'kenyonexpress-user-uploads',
    public: false,
    maxBytes: 10 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
  },
  /**
   * Course video ([91]). PRIVATE, and that is the whole point: a lesson is what
   * somebody paid for, so the object is never publicly addressable and is
   * reached only through a short-lived signed URL minted after
   * `has_course_access` has said yes.
   *
   * 2 GB, because a course lesson is a video file and the 10 MB ceiling on
   * `user-uploads` would refuse anything longer than a few seconds. The limit is
   * still a limit: it is what stops an admin upload form from being a way to
   * fill a bucket.
   *
   * `video/quicktime` is here because that is what an iPhone produces, and a
   * seller filming a lesson on a phone is the likeliest first upload this ever
   * sees. The alternative is a rejection they cannot act on.
   */
  'course-videos': {
    bucket: 'kenyonexpress-course-videos',
    public: false,
    maxBytes: 2 * 1024 * 1024 * 1024,
    allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
  },
}

export const R2_BUCKET_PURPOSES = Object.keys(R2_BUCKETS) as R2BucketPurpose[]

export function r2BucketName(purpose: R2BucketPurpose): string {
  return R2_BUCKETS[purpose].bucket
}

export function isPublicR2Bucket(purpose: R2BucketPurpose): boolean {
  return R2_BUCKETS[purpose].public
}

/**
 * Object keys are always caller-built (folder + uuid + extension), never raw
 * user input, but validate anyway so a bad caller fails loudly instead of
 * signing a URL for a path-traversal key.
 */
export function assertValidR2Key(key: string): void {
  if (!key || key.length > 1024) throw new Error(`R2 key length out of range: ${key.length}`)
  if (key.startsWith('/') || key.endsWith('/')) {
    throw new Error(`R2 key must not start or end with '/': ${key}`)
  }
  if (key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    throw new Error(`R2 key contains an empty or relative segment: ${key}`)
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control chars is the point
  if (/[\x00-\x1f\x7f]/.test(key)) {
    throw new Error('R2 key contains control characters')
  }
}
