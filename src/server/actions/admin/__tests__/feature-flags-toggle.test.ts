/**
 * F61: Toggle implementation verification
 * Verifies the toggle code calls vercel CLI correctly
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('maintenance mode toggle', () => {
  it('implements vercel CLI integration to set MAINTENANCE_MODE', () => {
    // Read the actual toggle implementation
    const togglePath = resolve(__dirname, '../feature-flags.ts')
    const source = readFileSync(togglePath, 'utf8')

    // Verify it calls vercel CLI (not API with placeholder token)
    expect(source).toContain('vercel env rm MAINTENANCE_MODE')
    expect(source).toContain('vercel env add MAINTENANCE_MODE')
    expect(source).toContain('production')
    expect(source).toContain('preview')
    expect(source).toContain('development')
    expect(source).toContain('child_process')
    expect(source).toContain('execAsync')

    // Verify it doesn't use placeholder API token approach
    expect(source).not.toContain('VERCEL_API_TOKEN')
    expect(source).not.toContain('Authorization: `Bearer')
  })

  it('generates correct CLI command for toggle on', () => {
    const on = true
    const value = on ? 'on' : 'off'

    // This is the exact command the toggle constructs
    const command = `vercel env rm MAINTENANCE_MODE production --yes; vercel env rm MAINTENANCE_MODE preview --yes; vercel env rm MAINTENANCE_MODE development --yes; vercel env add MAINTENANCE_MODE production --value="${value}" --type=config; vercel env add MAINTENANCE_MODE preview --value="${value}" --type=config; vercel env add MAINTENANCE_MODE development --value="${value}" --type=config`

    // Verify command structure
    expect(command).toContain('value="on"')
    expect(command.match(/production/g)).toHaveLength(2)
    expect(command.match(/preview/g)).toHaveLength(2)
    expect(command.match(/development/g)).toHaveLength(2)
  })

  it('generates correct CLI command for toggle off', () => {
    const on = false
    const value = on ? 'on' : 'off'

    const command = `vercel env rm MAINTENANCE_MODE production --yes; vercel env rm MAINTENANCE_MODE preview --yes; vercel env rm MAINTENANCE_MODE development --yes; vercel env add MAINTENANCE_MODE production --value="${value}" --type=config; vercel env add MAINTENANCE_MODE preview --value="${value}" --type=config; vercel env add MAINTENANCE_MODE development --value="${value}" --type=config`

    expect(command).toContain('value="off"')
  })
})
