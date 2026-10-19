// Partner API utilities tests

import { describe, expect, it } from 'vitest'
import {
  type PartnerApiScope,
  extractApiKey,
  generateApiKey,
  hasScopePermission,
  hashApiKey,
} from './index'

describe('Partner API Utilities', () => {
  describe('generateApiKey', () => {
    it('generates keys with ke_ prefix', () => {
      const key = generateApiKey()
      expect(key).toMatch(/^ke_/)
    })

    it('generates unique keys', () => {
      const key1 = generateApiKey()
      const key2 = generateApiKey()
      expect(key1 !== key2).toBe(true)
    })

    it('generates keys with correct format', () => {
      const key = generateApiKey()
      const parts = key.split('_')
      expect(parts.length).toBe(3)
      expect(parts[0]).toBe('ke')
      expect(parts[1]!.length).toBe(24) // 12 bytes * 2 for hex
      expect(parts[2]!.length).toBe(24) // 12 bytes * 2 for hex
    })
  })

  describe('hashApiKey', () => {
    it('generates consistent hashes', () => {
      const key = 'ke_test_key_1234567890abcdef'
      const hash1 = hashApiKey(key)
      const hash2 = hashApiKey(key)
      expect(hash1).toBe(hash2)
    })

    it('generates 64-char SHA-256 hash', () => {
      const key = generateApiKey()
      const hash = hashApiKey(key)
      expect(hash.length).toBe(64)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('generates different hashes for different keys', () => {
      const key1 = generateApiKey()
      const key2 = generateApiKey()
      expect(hashApiKey(key1)).not.toBe(hashApiKey(key2))
    })
  })

  describe('extractApiKey', () => {
    it('extracts key from Bearer token', () => {
      const key = 'ke_test_key_1234567890abcdef'
      const authHeader = `Bearer ${key}`
      expect(extractApiKey(authHeader)).toBe(key)
    })

    it('extracts key from ApiKey header', () => {
      const key = 'ke_test_key_1234567890abcdef'
      const authHeader = `ApiKey ${key}`
      expect(extractApiKey(authHeader)).toBe(key)
    })

    it('returns null for missing header', () => {
      expect(extractApiKey()).toBe(null)
      expect(extractApiKey(undefined)).toBe(null)
      expect(extractApiKey('')).toBe(null)
    })

    it('returns null for invalid header format', () => {
      expect(extractApiKey('Invalid ke_test_key_1234567890abcdef')).toBe(null)
      expect(extractApiKey('ke_test_key_1234567890abcdef')).toBe(null)
    })
  })

  describe('hasScopePermission', () => {
    it('grants permission for matching scope', () => {
      const scopes: PartnerApiScope[] = ['products:read', 'categories:read']
      expect(hasScopePermission(scopes, 'products:read')).toBe(true)
    })

    it('denies permission for missing scope', () => {
      const scopes: PartnerApiScope[] = ['products:read']
      expect(hasScopePermission(scopes, 'orders:read')).toBe(false)
    })

    it('handles empty scope list', () => {
      const scopes: PartnerApiScope[] = []
      expect(hasScopePermission(scopes, 'products:read')).toBe(false)
    })

    it('checks all scope types', () => {
      const allScopes: PartnerApiScope[] = [
        'products:read',
        'categories:read',
        'orders:read',
        'inventory:read',
        'prices:read',
      ]

      expect(hasScopePermission(allScopes, 'products:read')).toBe(true)
      expect(hasScopePermission(allScopes, 'categories:read')).toBe(true)
      expect(hasScopePermission(allScopes, 'orders:read')).toBe(true)
      expect(hasScopePermission(allScopes, 'inventory:read')).toBe(true)
      expect(hasScopePermission(allScopes, 'prices:read')).toBe(true)
    })
  })
})
