#!/usr/bin/env tsx
/**
 * TypeScript wrapper for setup-meilisearch.mjs
 *
 * Seeds the Meilisearch products index from the Supabase products table.
 * Uses the configuration from src/lib/search/meili-settings.ts including
 * Hebrew synonyms, tokenizer settings, and search attributes.
 *
 * Usage:
 *   MEILISEARCH_HOST=<host> MEILISEARCH_API_KEY=<key> tsx scripts/seed-meilisearch.ts
 *
 * Or from the existing MJS script:
 *   node scripts/setup-meilisearch.mjs
 *
 * Both are idempotent - re-running updates settings and re-syncs products.
 */

import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const SCRIPT = join(ROOT, 'scripts/setup-meilisearch.mjs')

try {
  // Forward all env vars and pass through exit code
  execSync(`node ${SCRIPT}`, {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
  })
} catch (error) {
  process.exit((error as { status?: number }).status ?? 1)
}
