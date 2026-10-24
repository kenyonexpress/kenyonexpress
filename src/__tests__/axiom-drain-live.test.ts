import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Live Axiom drain verification.
 *
 * This test actually sends a log to Axiom and verifies the response.
 * It reads credentials from .env.local, so it only runs when that file exists.
 */

function loadAxiomEnv(): { token: string; dataset: string } | null {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const content = readFileSync(envPath, 'utf8')

    const tokenMatch = content.match(/^AXIOM_TOKEN=["']?([^"'\n]+)["']?/m)
    const datasetMatch = content.match(/^AXIOM_DATASET=["']?([^"'\n]+)["']?/m)

    if (tokenMatch?.[1] && datasetMatch?.[1]) {
      return {
        token: tokenMatch[1],
        dataset: datasetMatch[1],
      }
    }
  } catch {
    // .env.local doesn't exist or can't be read
  }
  return null
}

describe('Axiom drain live verification', () => {
  const axiomEnv = loadAxiomEnv()

  it.skipIf(!axiomEnv)(
    'sends test log to Axiom and receives 200 OK',
    async () => {
      if (!axiomEnv) return // TypeScript guard

      const testLog = {
        _time: new Date().toISOString(),
        ts: new Date().toISOString(),
        level: 'info',
        event: 'c35_axiom_live_test',
        source: 'live-test',
        request_id: `test-${Date.now()}`,
        message: 'C35 Axiom drain live verification test',
      }

      const response = await fetch(
        `https://api.axiom.co/v1/datasets/${encodeURIComponent(axiomEnv.dataset)}/ingest`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${axiomEnv.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([testLog]),
          signal: AbortSignal.timeout(5000),
        },
      )

      expect(response.ok, `Axiom ingest failed: ${response.status} ${response.statusText}`).toBe(
        true,
      )

      const json = await response.json().catch(() => null)
      expect(json).toBeDefined()

      // Axiom returns ingestion stats
      if (json && typeof json === 'object') {
        console.log('✅ Axiom drain: WORKING')
        console.log(`   Dataset: ${axiomEnv.dataset}`)
        console.log(`   Response: ${JSON.stringify(json)}`)
        console.log(`   Event: ${testLog.event}`)
        console.log(`   Request ID: ${testLog.request_id}`)
      }
    },
    10000,
  ) // 10s timeout for network request

  it.skipIf(axiomEnv !== null)('Axiom credentials not available (test skipped, not failed)', () => {
    // This test passes when Axiom is not configured
    // The skip above means this only runs when axiomEnv is null
    expect(axiomEnv).toBeNull()
    console.log('⏭️  Axiom drain: NOT CONFIGURED (test skipped)')
  })
})
