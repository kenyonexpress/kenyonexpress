export interface CacheTag {
  resource: 'product' | 'category' | 'order' | 'coupon' | 'supplier'
  id?: string | number
}

interface CachePurgeRequest {
  tags: CacheTag[]
  paths?: string[]
  timestamp: number
}

export function buildCacheTags(resource: string, id?: string | number): CacheTag {
  if (resource === 'product' && id) {
    return { resource: 'product', id }
  }
  if (resource === 'category' && id) {
    return { resource: 'category', id }
  }
  if (resource === 'order' && id) {
    return { resource: 'order', id }
  }
  if (resource === 'coupon' && id) {
    return { resource: 'coupon', id }
  }
  if (resource === 'supplier' && id) {
    return { resource: 'supplier', id }
  }
  throw new Error(`Unknown cache resource: ${resource}`)
}

export function buildCachePaths(resource: CacheTag): string[] {
  const paths: string[] = []

  if (resource.resource === 'product' && resource.id) {
    paths.push('/product/:slug')
    paths.push(`/api/products/${resource.id}`)
    paths.push('/api/shop/products')
  }

  if (resource.resource === 'category' && resource.id) {
    paths.push('/shop/:category')
    paths.push(`/api/categories/${resource.id}`)
  }

  if (resource.resource === 'order' && resource.id) {
    paths.push(`/account/orders/${resource.id}`)
    paths.push(`/api/orders/${resource.id}`)
  }

  if (resource.resource === 'coupon' && resource.id) {
    paths.push(`/coupon/${resource.id}`)
    paths.push(`/api/coupons/${resource.id}`)
  }

  if (resource.resource === 'supplier' && resource.id) {
    paths.push('/suppliers')
    paths.push(`/api/suppliers/${resource.id}`)
  }

  return paths
}

export async function sendCachePurgeRequest(tags: CacheTag[], paths?: string[]): Promise<void> {
  const token = process.env.VERCEL_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || token === 'undefined' || !projectId || projectId === 'undefined') {
    return
  }

  const purgeRequest: CachePurgeRequest = {
    tags,
    paths,
    timestamp: Date.now(),
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(
      `https://api.vercel.com/v1/projects/${process.env.VERCEL_PROJECT_ID}/deployments/latest/purge`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(purgeRequest),
        signal: controller.signal,
      },
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      return
    }
  } catch {
    // Cache purge failure should not block request handling
  }
}

export async function purgeCacheForResource(resource: string, id?: string | number): Promise<void> {
  const tag = buildCacheTags(resource, id)
  const paths = buildCachePaths(tag)
  await sendCachePurgeRequest([tag], paths)
}

export function getCacheStatusHeader(
  status: 'hit' | 'miss' | 'dynamic' | 'private',
): Record<string, string> {
  return {
    'X-Cache-Status': status,
    'X-Cache-Tag': `${Date.now()}`,
  }
}

export function getCacheControl(
  maxAge: number,
  sMaxAge?: number,
  isPrivate = false,
): Record<string, string> {
  const cacheControl = isPrivate
    ? `private, max-age=${maxAge}, s-maxage=${sMaxAge ?? maxAge}`
    : `public, max-age=${maxAge}, s-maxage=${sMaxAge ?? maxAge}`

  return {
    'Cache-Control': cacheControl,
  }
}

export function parseXCacheStatus(header?: string): string {
  return header ?? 'unknown'
}
