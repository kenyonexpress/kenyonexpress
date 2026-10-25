// Partner API key and authentication utilities

import crypto from 'node:crypto'

export type PartnerApiScope =
  | 'products:read'
  | 'categories:read'
  | 'orders:read'
  | 'inventory:read'
  | 'prices:read'

export interface PartnerApiKeyConfig {
  id: string
  partnerId: string
  scopes: PartnerApiScope[]
  rateLimitPerHour: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining?: number
  limit?: number
  reason?: string
}

// Hash API key using SHA-256 (server-side only)
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// Generate a new API key (ke_<random>_<random>)
export function generateApiKey(): string {
  const prefix = 'ke_'
  const part1 = crypto.randomBytes(12).toString('hex') // 24 chars
  const part2 = crypto.randomBytes(12).toString('hex') // 24 chars
  return `${prefix}${part1}_${part2}`
}

// Extract API key from Authorization header
export function extractApiKey(authHeader?: string): string | null {
  if (!authHeader) return null

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  if (authHeader.startsWith('ApiKey ')) {
    return authHeader.substring(7)
  }

  return null
}

// Check if scope has permission for endpoint
export function hasScopePermission(
  scopes: PartnerApiScope[],
  requiredScope: PartnerApiScope,
): boolean {
  return scopes.includes(requiredScope)
}

// All scopes for partner access (default on new keys)
const DEFAULT_PARTNER_SCOPES: PartnerApiScope[] = ['products:read', 'categories:read']

// Public scope mapping (what external partners see)
export const PUBLIC_SCOPE_DESCRIPTIONS: Record<PartnerApiScope, string> = {
  'products:read': 'Read product catalog information',
  'categories:read': 'Read product categories',
  'orders:read': 'Read order data (for your partners only)',
  'inventory:read': 'Read real-time inventory levels',
  'prices:read': 'Read pricing information',
}
