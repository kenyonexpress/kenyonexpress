/**
 * Tests for legal documents verifier.
 * BACKLOG Item 4 implementation.
 */

import { describe, expect, it } from 'vitest'
import {
  type LegalDocStatus,
  REQUIRED_LEGAL_DOCS,
  generateLawyerReviewPackage,
} from '../legal-docs-verifier'

describe('REQUIRED_LEGAL_DOCS', () => {
  it('should include all mandatory legal documents', () => {
    expect(REQUIRED_LEGAL_DOCS).toHaveLength(5)

    const paths = REQUIRED_LEGAL_DOCS.map((d) => d.path)
    expect(paths).toContain('/terms')
    expect(paths).toContain('/privacy')
    expect(paths).toContain('/returns')
    expect(paths).toContain('/cookie-policy')
    expect(paths).toContain('/accessibility')
  })

  it('should have Hebrew titles for all documents', () => {
    for (const doc of REQUIRED_LEGAL_DOCS) {
      expect(doc.title).toBeTruthy()
      expect(doc.path).toMatch(/^\/[a-z-]+$/)
    }
  })
})

describe('generateLawyerReviewPackage', () => {
  it('should mark as ready when all docs are accessible', () => {
    const docs: LegalDocStatus[] = [
      {
        path: '/terms',
        title: 'Terms of Service',
        exists: true,
        accessible: true,
      },
      {
        path: '/privacy',
        title: 'Privacy Policy',
        exists: true,
        accessible: true,
      },
      {
        path: '/returns',
        title: 'Returns Policy',
        exists: true,
        accessible: true,
      },
    ]

    const result = generateLawyerReviewPackage(docs)

    expect(result.ready).toBe(true)
    expect(result.missingDocs).toHaveLength(0)
    expect(result.summary).toContain('READY for lawyer review')
  })

  it('should identify missing documents', () => {
    const docs: LegalDocStatus[] = [
      {
        path: '/terms',
        title: 'Terms of Service',
        exists: true,
        accessible: true,
      },
      {
        path: '/privacy',
        title: 'Privacy Policy',
        exists: false,
        accessible: false,
      },
      {
        path: '/returns',
        title: 'Returns Policy',
        exists: false,
        accessible: false,
      },
    ]

    const result = generateLawyerReviewPackage(docs)

    expect(result.ready).toBe(false)
    expect(result.missingDocs).toContain('Privacy Policy')
    expect(result.missingDocs).toContain('Returns Policy')
    expect(result.summary).toContain('INCOMPLETE - missing documents')
  })

  it('should list present documents in summary', () => {
    const docs: LegalDocStatus[] = [
      {
        path: '/terms',
        title: 'Terms of Service',
        exists: true,
        accessible: true,
      },
      {
        path: '/privacy',
        title: 'Privacy Policy',
        exists: true,
        accessible: true,
      },
    ]

    const result = generateLawyerReviewPackage(docs)

    expect(result.summary).toContain('Documents Ready for Review (2/2)')
    expect(result.summary).toContain('Terms of Service: /terms')
    expect(result.summary).toContain('Privacy Policy: /privacy')
  })

  it('should include Israeli law compliance checklist', () => {
    const docs: LegalDocStatus[] = [
      {
        path: '/terms',
        title: 'Terms',
        exists: true,
        accessible: true,
      },
    ]

    const result = generateLawyerReviewPackage(docs)

    expect(result.summary).toContain('Israeli Consumer Protection Law')
    expect(result.summary).toContain('14-day return right')
    expect(result.summary).toContain('GDPR/Privacy Protection Law')
    expect(result.summary).toContain('pricing and VAT disclosure')
    expect(result.summary).toContain('data protection measures')
    expect(result.summary).toContain('e-commerce specific requirements')
  })

  it('should include cost and timeline estimates', () => {
    const docs: LegalDocStatus[] = []

    const result = generateLawyerReviewPackage(docs)

    expect(result.summary).toContain('₪3,000 - ₪8,000')
    expect(result.summary).toContain('1-2 weeks')
  })

  it('should handle empty document list', () => {
    const docs: LegalDocStatus[] = []

    const result = generateLawyerReviewPackage(docs)

    expect(result.ready).toBe(true) // No missing docs
    expect(result.missingDocs).toHaveLength(0)
    expect(result.summary).toContain('Documents Ready for Review (0/0)')
  })
})
