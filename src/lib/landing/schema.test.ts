import { describe, expect, it } from 'vitest'
import { AUTHORED_LANDING_PAGES } from './authored'
import { LANDING_BLOCK_KINDS } from './blocks'
import {
  MAX_VARIANTS,
  landingBlockSchema,
  parseJsonText,
  parseLandingBlocks,
  parseLandingVariants,
} from './schema'

describe('landing block schema', () => {
  it('accepts every authored page, so the fallback can never fail its own schema', () => {
    for (const page of AUTHORED_LANDING_PAGES) {
      expect(parseLandingBlocks(page.blocks), page.slug).toMatchObject({ ok: true })
      expect(parseLandingVariants(page.variants), page.slug).toMatchObject({ ok: true })
    }
  })

  it('knows every kind the renderer switches on, and no other', () => {
    for (const kind of LANDING_BLOCK_KINDS) {
      // A minimal valid instance per kind: the schema must accept it.
      const minimal: Record<string, unknown> = {
        hero: { kind, headline: 'x' },
        text: { kind, paragraphs: ['x'] },
        benefits: { kind, items: [{ title: 'x' }] },
        products: { kind, slugs: [] },
        faq: { kind, items: [{ question: 'q', answer: 'a' }] },
        countdown: { kind, label: 'x', endsAt: '2026-12-31T00:00:00Z' },
        cta: { kind, label: 'x', href: '/products' },
      }
      expect(landingBlockSchema.safeParse(minimal[kind]).success, kind).toBe(true)
    }
    expect(landingBlockSchema.safeParse({ kind: 'video', url: '/x' }).success).toBe(false)
  })

  it('refuses a link that leaves the site, in a hero and in a CTA', () => {
    for (const href of [
      'https://evil.example',
      '//evil.example',
      'javascript:alert(1)',
      'products',
    ]) {
      expect(parseLandingBlocks([{ kind: 'cta', label: 'x', href }]).ok, href).toBe(false)
      expect(
        parseLandingBlocks([{ kind: 'hero', headline: 'x', cta: { label: 'x', href } }]).ok,
        href,
      ).toBe(false)
    }
  })

  it('names the JSON path of the failing field in Hebrew', () => {
    const outcome = parseLandingBlocks([
      { kind: 'text', paragraphs: ['ok'] },
      { kind: 'cta', label: '', href: '/x' },
    ])
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.errors.some((line) => line.startsWith('1.label:'))).toBe(true)
      expect(outcome.errors.join('\n')).toMatch(/[֐-׿]/)
    }
  })

  it('refuses a countdown with an unparseable date and a product slug with a slash', () => {
    expect(parseLandingBlocks([{ kind: 'countdown', label: 'x', endsAt: 'soon' }]).ok).toBe(false)
    expect(parseLandingBlocks([{ kind: 'products', slugs: ['a/b'] }]).ok).toBe(false)
  })
})

describe('landing variant schema', () => {
  it('accepts an empty list and a weighted pair', () => {
    expect(parseLandingVariants([]).ok).toBe(true)
    expect(
      parseLandingVariants([
        { key: 'control', weight: 50 },
        { key: 'b', weight: 50, blocks: [{ kind: 'text', paragraphs: ['x'] }] },
      ]).ok,
    ).toBe(true)
  })

  it('refuses duplicate keys, all-zero weights, bad keys and too many arms', () => {
    expect(
      parseLandingVariants([
        { key: 'a', weight: 1 },
        { key: 'a', weight: 1 },
      ]).ok,
    ).toBe(false)
    expect(
      parseLandingVariants([
        { key: 'a', weight: 0 },
        { key: 'b', weight: 0 },
      ]).ok,
    ).toBe(false)
    expect(parseLandingVariants([{ key: 'Big Key', weight: 1 }]).ok).toBe(false)
    expect(parseLandingVariants([{ key: 'a', weight: 1.5 }]).ok).toBe(false)
    expect(
      parseLandingVariants(
        Array.from({ length: MAX_VARIANTS + 1 }, (_, i) => ({ key: `v${i}`, weight: 1 })),
      ).ok,
    ).toBe(false)
  })

  it('validates the blocks inside a variant with the same rules', () => {
    const outcome = parseLandingVariants([
      { key: 'control', weight: 1 },
      { key: 'b', weight: 1, blocks: [{ kind: 'cta', label: 'x', href: 'https://evil.example' }] },
    ])
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.errors[0]).toMatch(/^1\.blocks\.0\.href/)
  })
})

describe('parseJsonText', () => {
  it('reads empty text as an empty list and bad JSON as one Hebrew line', () => {
    expect(parseJsonText('  ')).toEqual({ ok: true, value: [] })
    expect(parseJsonText('[1,')).toEqual({ ok: false, errors: ['JSON לא תקין'] })
    expect(parseJsonText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })
})
