/**
 * Matching R2 object keys to product SKUs, for the bulk image assign.
 *
 * The convention is the one a person naming files for a catalogue already
 * uses: the file is called after the SKU, optionally with a gallery number.
 * For SKU `AB-100` all of these match, in this order:
 *
 *   catalog/AB-100.jpg        (the main image)
 *   catalog/AB-100-1.webp     (then by number)
 *   catalog/ab_100_2.png      (case and the - / _ separator are ignored)
 *
 * and none of these do: `AB-1000.jpg` (a longer SKU), `AB-100-front.jpg`
 * (a word suffix - too easy to collide with another SKU's stem), or a file
 * without an image extension. Matching is on the LAST path segment only, so
 * the prefix the admin lists under can be anything.
 *
 * Pure. The caller lists the bucket and turns keys into URLs.
 */

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'])

/** Lower-cased, with `-`, `_` and spaces collapsed to one form, so `ab_100` and `AB-100` agree. */
export function normaliseSkuStem(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
}

export interface MatchedKey {
  key: string
  /** 0 for the bare SKU file, otherwise the gallery number. */
  order: number
}

interface ParsedKey {
  key: string
  stem: string
}

function parseKey(key: string): ParsedKey | null {
  const base = key.slice(key.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return null
  const ext = base.slice(dot + 1).toLowerCase()
  if (!IMAGE_EXTENSIONS.has(ext)) return null
  return { key, stem: normaliseSkuStem(base.slice(0, dot)) }
}

/**
 * Groups object keys by the SKU they name. The returned map is keyed by the
 * SKU lower-cased (what `planProductChange` looks up) and each list is in
 * gallery order. A key that matches no SKU is dropped; a SKU with no key is
 * absent from the map.
 */
export function matchR2KeysToSkus(
  keys: readonly string[],
  skus: readonly string[],
): Map<string, string[]> {
  // stem -> the original SKUs (lower-cased) that normalise to it. Two SKUs
  // that differ only by separator both receive the same files; that is the
  // catalogue's ambiguity to resolve, not this function's to hide.
  const skusByStem = new Map<string, string[]>()
  for (const raw of skus) {
    const sku = raw.trim()
    if (sku === '') continue
    const stem = normaliseSkuStem(sku)
    const list = skusByStem.get(stem)
    const lower = sku.toLowerCase()
    if (list) {
      if (!list.includes(lower)) list.push(lower)
    } else {
      skusByStem.set(stem, [lower])
    }
  }

  const matches = new Map<string, MatchedKey[]>()
  for (const key of keys) {
    const parsed = parseKey(key)
    if (!parsed) continue
    // Exact stem, or stem + '-' + digits. Try the exact form first; then peel
    // one numeric suffix and try again.
    let stem = parsed.stem
    let order = 0
    if (!skusByStem.has(stem)) {
      const m = /^(.*)-(\d{1,4})$/.exec(stem)
      if (!m) continue
      stem = m[1] as string
      order = Number(m[2])
      if (!skusByStem.has(stem)) continue
    }
    for (const sku of skusByStem.get(stem) ?? []) {
      const list = matches.get(sku)
      if (list) list.push({ key: parsed.key, order })
      else matches.set(sku, [{ key: parsed.key, order }])
    }
  }

  const out = new Map<string, string[]>()
  for (const [sku, list] of matches) {
    list.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    out.set(
      sku,
      list.map((m) => m.key),
    )
  }
  return out
}
