import { describe, expect, it } from 'vitest'
import { faqEntries } from './faq'
import { LEGAL_PAGE_SLUGS, getLegalPage } from './index'
import type { LegalBlock } from './types'

/**
 * What a legal page must not be.
 *
 * These documents are the part of the site nobody looks at after it ships, and
 * the part a customer, a clearing house and a regulator all read as binding. So
 * the tests are about the failure modes that survive a review: leftover markup
 * from the migration, the English sample text that must never reach a page, and
 * a newly written document that quietly loses the notice saying it has not been
 * through a lawyer.
 */

function textOf(blocks: readonly LegalBlock[]): string {
  return blocks
    .map((block) =>
      block.type === 'ordered' || block.type === 'unordered' ? block.items.join(' ') : block.text,
    )
    .join('\n')
}

describe('legal pages', () => {
  it('serves the four addresses the old site already publishes', () => {
    // GO-LIVE lists these as old pages with no target, which is what makes
    // redirect_coverage fail 98/103. Same paths, no invented redirects.
    expect(LEGAL_PAGE_SLUGS.sort()).toEqual(
      ['accessibility', 'privacy-policy', 'refund_returns', 'terms-and-conditions'].sort(),
    )
  })

  it.each(LEGAL_PAGE_SLUGS)('%s has a title, a date, a description and real content', (slug) => {
    const doc = getLegalPage(slug)
    expect(doc.title.trim().length).toBeGreaterThan(2)
    expect(doc.description.trim().length).toBeGreaterThan(30)
    expect(Number.isNaN(Date.parse(doc.updatedAt))).toBe(false)
    expect(doc.blocks.length).toBeGreaterThan(3)
    expect(textOf(doc.blocks).length).toBeGreaterThan(500)
  })

  it.each(LEGAL_PAGE_SLUGS)('%s is in Hebrew and carries no leftover markup', (slug) => {
    const text = textOf(getLegalPage(slug).blocks)
    expect(/[֐-׿]/.test(text)).toBe(true)
    // The WordPress export interleaves Gutenberg block comments and stray tags
    // with the prose. Any of these in the output means the parser let markup
    // through into a document rendered as plain text.
    expect(text).not.toContain('<')
    expect(text).not.toContain('wp:')
    expect(text).not.toContain('&nbsp;')
    expect(text).not.toContain('&amp;')
    expect(text).not.toContain('[vc_')
    // Non-breaking spaces survive `&nbsp;` decoding and read as odd gaps.
    expect(text).not.toContain(' ')
  })

  it('never publishes the English WooCommerce sample returns policy', () => {
    // `/refund_returns` in the export is 5,149 characters starting with "This
    // is a sample page", promising a 30-day window nobody agreed to. It is the
    // one page in the migration that had to be written instead of copied.
    const text = textOf(getLegalPage('refund_returns').blocks)
    expect(text).not.toMatch(/sample page/i)
    expect(text).not.toMatch(/refund and returns policy lasts/i)
    expect(text).toContain('14 ימים')
  })

  it('states the cancellation fee the code actually charges', () => {
    // computeCancellationFee is min(5%, ₪100), and a page promising anything
    // else would be a promise the system breaks by itself.
    const text = textOf(getLegalPage('refund_returns').blocks)
    expect(text).toContain('5%')
    expect(text).toContain('100 ש"ח')
    expect(text).toMatch(/הנמוך מביניהם/)
  })

  it('keeps the review notice on the documents that have not been through a lawyer', () => {
    // Deleting the notice is a one-word change that turns a draft into what
    // looks like a final legal document, so it is asserted rather than trusted.
    expect(getLegalPage('refund_returns').reviewNotice).toBeTruthy()
    expect(getLegalPage('accessibility').reviewNotice).toBeTruthy()
    // The migrated pair is the site's own published text and carries no notice.
    expect(getLegalPage('privacy-policy').reviewNotice).toBeUndefined()
    expect(getLegalPage('terms-and-conditions').reviewNotice).toBeUndefined()
  })

  it('the accessibility statement names the standard, the level and a way to complain', () => {
    const text = textOf(getLegalPage('accessibility').blocks)
    expect(text).toContain('5568')
    expect(text).toContain('AA')
    expect(text).toMatch(/info@kenyonexpress\.co\.il/)
    // A statement with no known-limitations section is a template, not a
    // statement about this site.
    expect(
      getLegalPage('accessibility').blocks.some(
        (b) => b.type === 'heading' && b.text.includes('מגבלות'),
      ),
    ).toBe(true)
  })

  it('the migrated documents kept their structure, not just their words', () => {
    for (const slug of ['privacy-policy', 'terms-and-conditions'] as const) {
      const blocks = getLegalPage(slug).blocks
      // Promoted headings: a 1,700+ word document with no landmarks cannot be
      // navigated by heading with a screen reader.
      expect(blocks.filter((b) => b.type === 'heading').length).toBeGreaterThanOrEqual(5)
      expect(blocks.some((b) => b.type === 'ordered' || b.type === 'unordered')).toBe(true)
    }
  })
})

describe('faq', () => {
  it('answers in Hebrew, with no empty entries', () => {
    expect(faqEntries.length).toBeGreaterThanOrEqual(8)
    for (const entry of faqEntries) {
      expect(entry.question.trim().endsWith('?')).toBe(true)
      expect(entry.answer.trim().length).toBeGreaterThan(40)
      expect(/[֐-׿]/.test(entry.answer)).toBe(true)
    }
  })

  it('asks each question once, because the JSON-LD is built from this array', () => {
    const questions = faqEntries.map((e) => e.question)
    expect(new Set(questions).size).toBe(questions.length)
  })
})
