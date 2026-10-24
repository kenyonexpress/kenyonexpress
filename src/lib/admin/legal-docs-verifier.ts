/**
 * Legal documents verifier.
 * BACKLOG Item 4: Verifies ToS, Privacy, Returns pages exist and exports for lawyer.
 */

export interface LegalDocStatus {
  path: string
  title: string
  exists: boolean
  accessible: boolean
  lastModified?: Date
}

export const REQUIRED_LEGAL_DOCS = [
  { path: '/terms', title: 'Terms of Service' },
  { path: '/privacy', title: 'Privacy Policy' },
  { path: '/returns', title: 'Returns Policy' },
  { path: '/cookie-policy', title: 'Cookie Policy' },
  { path: '/accessibility', title: 'Accessibility Statement' },
] as const

/**
 * Check if all required legal documents are in place.
 * Returns true if all documents exist and are accessible.
 */
export async function verifyLegalDocs(baseUrl = 'http://localhost:3000'): Promise<{
  allPresent: boolean
  docs: LegalDocStatus[]
  missing: string[]
}> {
  const results: LegalDocStatus[] = []
  const missing: string[] = []

  for (const doc of REQUIRED_LEGAL_DOCS) {
    try {
      const response = await fetch(`${baseUrl}${doc.path}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      })

      const status: LegalDocStatus = {
        path: doc.path,
        title: doc.title,
        exists: response.ok,
        accessible: response.ok,
        lastModified: response.headers.get('last-modified')
          ? new Date(response.headers.get('last-modified')!)
          : undefined,
      }

      results.push(status)

      if (!response.ok) {
        missing.push(doc.title)
      }
    } catch {
      results.push({
        path: doc.path,
        title: doc.title,
        exists: false,
        accessible: false,
      })
      missing.push(doc.title)
    }
  }

  return {
    allPresent: missing.length === 0,
    docs: results,
    missing,
  }
}

/**
 * Generate lawyer review package summary.
 */
export function generateLawyerReviewPackage(docs: LegalDocStatus[]): {
  ready: boolean
  summary: string
  missingDocs: string[]
} {
  const present = docs.filter((d) => d.accessible)
  const missing = docs.filter((d) => !d.accessible).map((d) => d.title)

  const summary = `
Legal Document Review Package
============================

Documents Ready for Review (${present.length}/${docs.length}):
${present.map((d) => `- ${d.title}: ${d.path}`).join('\n')}

${
  missing.length > 0
    ? `
Missing Documents (${missing.length}):
${missing.map((m) => `- ${m}`).join('\n')}
`
    : ''
}

Status: ${missing.length === 0 ? 'READY for lawyer review' : 'INCOMPLETE - missing documents'}

Instructions for Lawyer:
1. Review each document for Israeli Consumer Protection Law compliance
2. Check 14-day return right disclosure
3. Verify GDPR/Privacy Protection Law alignment
4. Confirm clear pricing and VAT disclosure
5. Validate data protection measures
6. Check e-commerce specific requirements

Expected Cost: ₪3,000 - ₪8,000 for comprehensive review
Turnaround: 1-2 weeks typical
  `.trim()

  return {
    ready: missing.length === 0,
    summary,
    missingDocs: missing,
  }
}
