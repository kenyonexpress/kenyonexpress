#!/usr/bin/env node
/**
 * Lifts the two REAL legal documents out of the WordPress export into content
 * modules this app renders.
 *
 * WHY THIS IS A MIGRATION AND NOT AUTHORSHIP
 *
 * `/privacy-policy` and `/terms-and-conditions` are already published on
 * kenyonexpress.co.il, in Hebrew, and the WXR backup carries them in full
 * (12,132 and 17,376 characters, measured). Retyping them would be authoring a
 * legal document; copying the site's own published text is not. This script is
 * how that copy stays checkable: run it again and the output must not change.
 *
 * WHAT IS DELIBERATELY NOT MIGRATED
 *
 * `/refund_returns` is 5,149 characters of the WooCommerce SAMPLE PAGE, in
 * English, starting with the words "This is a sample page". A returns policy is
 * a binding commitment in an Israeli store, and the source here is literally
 * placeholder text about a 30-day window nobody agreed to. It is written fresh
 * against the implemented refund rules instead, and this script refuses to
 * touch it.
 *
 * `/about` is WPBakery shortcodes with no prose, and `/contact` is 166
 * characters of a form shortcode. Both already have real pages here.
 *
 * THE MARKUP IS NOT CLEAN, AND THAT MATTERS
 *
 * The terms export carries empty `<section>` pairs, stray closing `</p>` tags
 * with no opener, and Gutenberg block comments interleaved with the text. Piped
 * into `dangerouslySetInnerHTML` that is a legal document rendered through a
 * browser's error recovery. So it is parsed into a block list instead -
 * headings, paragraphs, lists - and rendered as React by one component.
 *
 * Usage: node scripts/legal/extract-wp-legal.mjs [--check]
 *   --check exits non-zero if the generated file differs, for CI.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WXR = 'data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml'
const OUT = 'src/content/legal/wp-migrated.ts'

/** slug -> the document key used in the app. */
const WANTED = {
  'privacy-policy': 'privacyPolicy',
  'terms-and-conditions': 'termsAndConditions',
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8216;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Visible text of an HTML fragment: tags dropped, entities decoded, spaces collapsed. */
function textOf(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * WP HTML -> blocks.
 *
 * Section headings in these documents are a paragraph whose entire content is
 * bold ("א. הקדמה"), which is a heading in every sense except the tag. They are
 * promoted, because a screen reader user navigating by heading otherwise gets a
 * 17,000 character document with two landmarks in it.
 */
function toBlocks(html) {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, '') // Gutenberg block comments
    .replace(/<section>\s*<\/section>/gi, '')

  const blocks = []
  const pattern =
    /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>|<(ol|ul)[^>]*>([\s\S]*?)<\/\3>|<p[^>]*>([\s\S]*?)<\/p>/gi

  for (const match of source.matchAll(pattern)) {
    const [, headingTag, headingBody, listTag, listBody, paragraphBody] = match

    if (headingTag) {
      const text = textOf(headingBody)
      if (text) blocks.push({ type: 'heading', text })
      continue
    }

    if (listTag) {
      const items = [...listBody.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((li) => textOf(li[1]))
        .filter(Boolean)
      if (items.length > 0) blocks.push({ type: listTag === 'ol' ? 'ordered' : 'unordered', items })
      continue
    }

    const raw = paragraphBody ?? ''
    const text = textOf(raw)
    if (!text) continue
    // A paragraph that is entirely bold is a heading wearing a <p>.
    const bolded = textOf(raw.replace(/<(?!\/?(strong|b)\b)[^>]+>/g, ''))
    const isHeading = bolded === text && text.length <= 120 && /<(strong|b)\b/i.test(raw)
    blocks.push(isHeading ? { type: 'heading', text } : { type: 'paragraph', text })
  }

  return blocks
}

function extract() {
  const xml = readFileSync(WXR, 'utf8')
  const items = xml.split('<item>').slice(1)
  const found = {}

  for (const item of items) {
    const slug = /<wp:post_name><!\[CDATA\[([\s\S]*?)\]\]><\/wp:post_name>/.exec(item)?.[1]
    const type = /<wp:post_type><!\[CDATA\[([\s\S]*?)\]\]><\/wp:post_type>/.exec(item)?.[1]
    if (type !== 'page' || !slug || !(slug in WANTED)) continue

    // The export wraps some titles in CDATA and leaves others bare.
    const rawTitle = /<title>([\s\S]*?)<\/title>/.exec(item)?.[1]?.trim() ?? slug
    const title = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(rawTitle)?.[1] ?? rawTitle
    const body = /<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/.exec(item)?.[1]
    if (!body) throw new Error(`no content for ${slug}`)

    const blocks = toBlocks(body)
    const words = blocks.reduce(
      (n, b) =>
        n +
        (b.type === 'ordered' || b.type === 'unordered' ? b.items.join(' ') : b.text).split(' ')
          .length,
      0,
    )
    found[WANTED[slug]] = { slug, title: decodeEntities(title), blocks }
    process.stderr.write(
      `${slug}: ${body.length} chars -> ${blocks.length} blocks, ~${words} words\n`,
    )
  }

  const missing = Object.values(WANTED).filter((key) => !(key in found))
  if (missing.length > 0) throw new Error(`missing from the export: ${missing.join(', ')}`)
  return found
}

function render(found) {
  return `// GENERATED by scripts/legal/extract-wp-legal.mjs from
// data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml — do not edit by hand.
//
// This is the site's OWN published Hebrew legal text, lifted out of the
// WordPress export rather than rewritten. See the script's header for what is
// deliberately NOT migrated (the English WooCommerce sample returns policy).

import type { LegalBlock } from '@/content/legal/types'

export interface MigratedLegalDocument {
  slug: string
  title: string
  blocks: LegalBlock[]
}

${Object.entries(found)
  .map(
    ([key, doc]) =>
      `export const ${key}: MigratedLegalDocument = ${JSON.stringify(doc, null, 2)}\n`,
  )
  .join('\n')}`
}

const found = extract()
const output = render(found)
const path = resolve(process.cwd(), OUT)

if (process.argv.includes('--check')) {
  const current = readFileSync(path, 'utf8')
  if (current !== output) {
    process.stderr.write(`${OUT} is out of date; re-run without --check\n`)
    process.exit(1)
  }
  process.stderr.write(`${OUT} is up to date\n`)
} else {
  writeFileSync(path, output)
  process.stderr.write(`wrote ${OUT}\n`)
}
