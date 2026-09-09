import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { imageAttachmentsFromWxr } from './wxr-images.mjs'

const fixture = readFileSync(
  resolve(process.cwd(), 'scripts/wp-import/fixtures/sample.wxr.xml'),
  'utf8',
)

const item = ({ id, type = 'attachment', url, alt, title }) => `
  <item>
    <title><![CDATA[${title ?? 'untitled'}]]></title>
    <wp:post_id>${id}</wp:post_id>
    <wp:post_type><![CDATA[${type}]]></wp:post_type>
    ${url ? `<wp:attachment_url><![CDATA[${url}]]></wp:attachment_url>` : ''}
    ${
      alt
        ? `<wp:postmeta><wp:meta_key><![CDATA[_wp_attachment_image_alt]]></wp:meta_key>
           <wp:meta_value><![CDATA[${alt}]]></wp:meta_value></wp:postmeta>`
        : ''
    }
  </item>`

describe('imageAttachmentsFromWxr', () => {
  it('reads the image attachments out of the real fixture', () => {
    const items = imageAttachmentsFromWxr(fixture)
    expect(items.length).toBeGreaterThan(0)
    for (const it_ of items) {
      expect(it_.source_kind).toBe('wp_attachment')
      expect(it_.source_url).toMatch(/^https:\/\//)
      expect(it_.source_url).toMatch(/\.(jpe?g|png|webp|gif)$/i)
      expect(it_.wp_attachment_id).toBeTypeOf('number')
    }
  })

  it('keeps the alt text when the export carries one', () => {
    const items = imageAttachmentsFromWxr(fixture)
    expect(items.some((i) => i.alt_he && /[֐-׿]/.test(i.alt_he))).toBe(true)
  })

  it('skips non-attachment items and non-image attachments', () => {
    const xml = [
      item({ id: 1, type: 'product', url: 'https://x.test/a.jpg' }),
      item({ id: 2, url: 'https://x.test/clip.mov' }),
      item({ id: 3, url: 'https://x.test/notes.txt' }),
      item({ id: 4, url: 'https://x.test/real.png' }),
    ].join('')
    expect(imageAttachmentsFromWxr(xml)).toEqual([
      {
        source_url: 'https://x.test/real.png',
        source_kind: 'wp_attachment',
        wp_attachment_id: 4,
        alt_he: 'untitled',
      },
    ])
  })

  it('deduplicates by URL, keeping the first attachment id', () => {
    const xml = [
      item({ id: 10, url: 'https://x.test/same.webp', alt: 'ראשון' }),
      item({ id: 11, url: 'https://x.test/same.webp', alt: 'שני' }),
    ].join('')
    const items = imageAttachmentsFromWxr(xml)
    expect(items).toHaveLength(1)
    expect(items[0].wp_attachment_id).toBe(10)
    expect(items[0].alt_he).toBe('ראשון')
  })

  it('falls back from missing alt meta to the title, and to null when both are blank', () => {
    const xml = [
      item({ id: 20, url: 'https://x.test/titled.jpg', title: 'שם הקובץ' }),
      item({ id: 21, url: 'https://x.test/blank.jpg', title: ' ' }),
    ].join('')
    const [titled, blank] = imageAttachmentsFromWxr(xml)
    expect(titled.alt_he).toBe('שם הקובץ')
    expect(blank.alt_he).toBeNull()
  })
})
