#!/usr/bin/env node
/**
 * Export legal documents for lawyer review.
 * BACKLOG Item 4: Generates a complete package for legal review.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  REQUIRED_LEGAL_DOCS,
  generateLawyerReviewPackage,
} from '../src/lib/admin/legal-docs-verifier.ts'

const OUTPUT_DIR = join(process.cwd(), 'legal-review-export')
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function exportLegalDocs() {
  console.log('📄 Exporting legal documents for lawyer review...\n')

  // Create output directory
  await mkdir(OUTPUT_DIR, { recursive: true })

  // Fetch each legal document
  const docs = []

  for (const doc of REQUIRED_LEGAL_DOCS) {
    console.log(`Fetching ${doc.title} from ${doc.path}...`)

    try {
      const response = await fetch(`${BASE_URL}${doc.path}`)

      if (!response.ok) {
        console.warn(`  ⚠️  ${doc.title}: HTTP ${response.status}`)
        docs.push({
          path: doc.path,
          title: doc.title,
          exists: false,
          accessible: false,
        })
        continue
      }

      const html = await response.text()

      // Extract text content (remove HTML tags)
      const text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      // Save to file
      const filename = `${doc.path.replace(/\//g, '')}.txt`
      await writeFile(join(OUTPUT_DIR, filename), text, 'utf-8')

      console.log(`  ✅ Exported to ${filename}`)

      docs.push({
        path: doc.path,
        title: doc.title,
        exists: true,
        accessible: true,
        lastModified: new Date(response.headers.get('last-modified') || Date.now()),
      })
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`)
      docs.push({
        path: doc.path,
        title: doc.title,
        exists: false,
        accessible: false,
      })
    }
  }

  // Generate review package summary
  console.log('\n📋 Generating lawyer review package...')
  const reviewPackage = generateLawyerReviewPackage(docs)

  await writeFile(join(OUTPUT_DIR, 'LAWYER-REVIEW-PACKAGE.txt'), reviewPackage.summary, 'utf-8')

  console.log('  ✅ Package summary saved\n')

  // Summary
  console.log('='.repeat(60))
  console.log(`Export complete: ${OUTPUT_DIR}`)
  console.log(`Documents exported: ${docs.filter((d) => d.accessible).length}/${docs.length}`)
  console.log(`Package ready: ${reviewPackage.ready ? '✅ YES' : '❌ NO'}`)

  if (!reviewPackage.ready) {
    console.log('\nMissing documents:')
    for (const missing of reviewPackage.missingDocs) {
      console.log(`  - ${missing}`)
    }
  }

  console.log('\n📂 Files in export directory:')
  console.log('   - LAWYER-REVIEW-PACKAGE.txt (cover letter with checklist)')
  for (const doc of docs.filter((d) => d.accessible)) {
    console.log(`   - ${doc.path.replace(/\//g, '')}.txt (${doc.title})`)
  }

  console.log('\n📧 Next steps:')
  console.log('   1. Review the exported files')
  console.log('   2. Zip the entire directory')
  console.log('   3. Send to Israeli e-commerce lawyer')
  console.log('   4. Budget: ₪3,000 - ₪8,000')
  console.log('   5. Turnaround: 1-2 weeks\n')

  process.exit(reviewPackage.ready ? 0 : 1)
}

exportLegalDocs().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
