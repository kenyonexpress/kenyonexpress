// The waiting set, read straight from the WXR export.
//
// 02-transform's media inventory deliberately keeps only attachments that a
// WooCommerce product references (66 of 404): it feeds the product importer.
// The ingest ledger has the opposite brief -- EVERY image the old site hosted
// is an image the platform is supposed to hold, whether or not a product
// points at it today, because the origin that served them is gone and the
// export is the only remaining list of what existed.
//
// Parsing is per <item> block with the same regex approach lib/wxr.mjs uses
// for its fields: WXR is machine-generated RSS with CDATA-wrapped values, and
// the four fields read here are single-line and unambiguous. The 12MB file
// stays a string; no XML DOM.

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i

const cdata = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))
  return m ? m[1] : null
}

/**
 * Every image attachment in a WXR export, one entry per distinct URL.
 *
 * Non-image attachments (mov/svg/txt/zip in the real export) are skipped: the
 * derivative pipeline is sharp, and sharp has nothing to say about a video.
 * Duplicate URLs keep the first attachment id, matching the ledger's rule that
 * `source_url` is the identity of a waiting item.
 */
export function imageAttachmentsFromWxr(xml) {
  const seen = new Map()
  for (const block of xml.split('<item>').slice(1)) {
    const type = cdata(block, 'wp:post_type')
    if (type !== 'attachment') continue
    const url = cdata(block, 'wp:attachment_url')
    if (!url || !IMAGE_EXT.test(url)) continue
    if (seen.has(url)) continue

    const idText = block.match(/<wp:post_id>(\d+)<\/wp:post_id>/)?.[1]
    // _wp_attachment_image_alt is the alt text the old site showed; the title
    // is the fallback so media_assets' NOT NULL alt_he can be satisfied later.
    const altMeta = block.match(
      /<wp:meta_key><!\[CDATA\[_wp_attachment_image_alt\]\]><\/wp:meta_key>\s*<wp:meta_value><!\[CDATA\[([\s\S]*?)\]\]><\/wp:meta_value>/,
    )?.[1]

    seen.set(url, {
      source_url: url,
      source_kind: 'wp_attachment',
      wp_attachment_id: idText ? Number(idText) : null,
      alt_he: (altMeta || cdata(block, 'title') || '').trim() || null,
    })
  }
  return [...seen.values()]
}
