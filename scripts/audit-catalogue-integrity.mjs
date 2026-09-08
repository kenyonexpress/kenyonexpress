#!/usr/bin/env node
/**
 * AUDITS THE CATALOGUE FOR ROWS THAT SEARCH AND SEO CANNOT BOTH BE RIGHT ABOUT.
 *
 * WHY. Verifying search on 2026-09-08 turned up eight ACTIVE products whose
 * `slug` and `name_he` describe different products entirely:
 *
 *   /product/שעון-אפל-חכם-apple-watch-series-7  ->  "ארוחת בוקר זוגית בקפה גן סיפור"
 *   /product/חיתולי-האגיס                        ->  "פלייסטישן 5"
 *   /product/ארוחת-שף-במסעדת-אולטרה              ->  "טיפול פנים"
 *
 * That is not a search bug and no amount of synonym work fixes it. The URL, the
 * canonical tag, the sitemap entry and every inbound link say one product; the
 * page says another. A shopper searching שעון correctly gets nothing, because
 * no product is NAMED that - only slugged that.
 *
 * These rows are almost certainly seed churn: a name reassigned without the
 * slug following. Which half is authoritative is a catalogue decision (changing
 * a slug is an SEO event, changing a name is a merchandising one), so this
 * script REPORTS and does not repair.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/audit-catalogue-integrity.mjs [--json]
 *
 * Exit: 0 clean, 1 findings, 2 could not run.
 */

const JSON_OUT = process.argv.includes('--json')

const fail = (msg) => {
  console.error(`audit-catalogue-integrity: ${msg}`)
  process.exit(2)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required')

const HEBREW = /[א-ת]/

/**
 * A slug word worth comparing. Short words are dropped because Hebrew's
 * two-letter prepositions and the transliteration noise in mixed slugs produce
 * coincidental matches in both directions.
 */
const significant = (word) => word.length > 2 && HEBREW.test(word)

const main = async () => {
  const res = await fetch(
    `${url}/rest/v1/products?select=id,slug,name_he,status,deleted_at&status=eq.active&deleted_at=is.null`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  if (!res.ok) fail(`products -> ${res.status} ${await res.text()}`)
  const products = await res.json()

  const findings = []
  for (const p of products) {
    const slugWords = String(p.slug ?? '')
      .split('-')
      .filter(significant)
    // Under two significant Hebrew words there is not enough signal to call a
    // mismatch: a one-word slug that happens to differ is as likely a rename.
    if (slugWords.length < 2) continue

    const name = String(p.name_he ?? '')
    const matched = slugWords.filter((w) => name.includes(w))
    if (matched.length === 0) {
      findings.push({
        id: p.id,
        slug: p.slug,
        name_he: name,
        detail: `${slugWords.length} Hebrew slug words, none present in name_he`,
      })
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ checked: products.length, findings }, null, 2))
  } else {
    console.log(`audit-catalogue-integrity: ${products.length} active products checked`)
    if (findings.length === 0) console.log('  no slug/name divergence')
    for (const f of findings) {
      console.error(`  DIVERGED  /product/${f.slug}`)
      console.error(`            renders "${f.name_he}"`)
    }
    if (findings.length > 0) {
      console.error(
        `\n${findings.length} product(s) whose URL and title describe different products.`,
      )
      console.error('Deciding which half is authoritative is a catalogue call, not a code one:')
      console.error('changing the slug is an SEO event, changing the name is a merchandising one.')
    }
  }
  process.exit(findings.length === 0 ? 0 : 1)
}

main().catch((e) => fail(e.stack ?? String(e)))
