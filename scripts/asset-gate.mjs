#!/usr/bin/env node
/**
 * The build-blocking half of the template-asset rule. `pnpm lint` runs it.
 * The rule is in `scripts/template-asset-scan.mjs`, shared with
 * `src/lib/template-assets.test.ts`.
 *
 * Exit: 0 clean, 1 violations.
 */
import { formatTemplateAssets, scanTemplateAssets } from './template-asset-scan.mjs'

const offenders = scanTemplateAssets()

if (offenders.length === 0) {
  console.log('asset gate: clean (no template or vendor product imagery under public/images)')
  process.exit(0)
}

console.error(`asset gate: ${offenders.length} template/vendor asset(s)\n`)
console.error(formatTemplateAssets(offenders))
console.error("\nThis repo ships no other company's product photography. A slot with no")
console.error('real photograph yet renders <BrandPlaceholder/>, which says so on the page.')
process.exit(1)
