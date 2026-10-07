import { describe, expect, it } from 'vitest'
import {
  PRIVATE_PREFIXES,
  STATIC_PATHS,
  auditDocument,
  auditRobotsTxt,
  auditSitemapXml,
  parseHead,
  pickPaths,
} from './audit.mjs'

const ORIGIN = 'https://kenyonexpress.co.il'

/** A head the way Next serves it for `publicPageMetadata({ path: '/faq' })`. */
function goodHead(overrides = {}) {
  const o = {
    canonical: `${ORIGIN}/faq`,
    heIL: `${ORIGIN}/faq`,
    xDefault: `${ORIGIN}/faq`,
    ogUrl: `${ORIGIN}/faq`,
    ogImage: `${ORIGIN}/opengraph-image?abc`,
    robots: '',
    jsonLd: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'q', acceptedAnswer: { '@type': 'Answer', text: 'a' } },
      ],
    }),
    extra: '',
    ...overrides,
  }
  return `<!DOCTYPE html><html lang="he" dir="rtl" class="x"><head>
<meta charSet="utf-8"/>
<title>שאלות נפוצות | קניון אקספרס</title>
<meta name="description" content="תשובות"/>
${o.robots ? `<meta name="robots" content="${o.robots}"/>` : ''}
<link rel="canonical" href="${o.canonical}"/>
<link rel="alternate" hrefLang="he-IL" href="${o.heIL}"/>
<link rel="alternate" hrefLang="x-default" href="${o.xDefault}"/>
<meta property="og:title" content="שאלות נפוצות"/>
<meta property="og:description" content="תשובות"/>
<meta property="og:url" content="${o.ogUrl}"/>
<meta property="og:site_name" content="קניון אקספרס"/>
<meta property="og:locale" content="he_IL"/>
<meta property="og:image" content="${o.ogImage}"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="שאלות נפוצות"/>
<meta name="twitter:description" content="תשובות"/>
<meta name="twitter:image" content="${o.ogImage}"/>
${o.extra}
</head><body>
<script type="application/ld+json">${o.jsonLd}</script>
<p>hi</p></body></html>`
}

function errors(issues) {
  return issues.filter((i) => i.level === 'error').map((i) => `${i.check}: ${i.message}`)
}

describe('parseHead', () => {
  it('reads html attributes, title, meta by name and property, links and JSON-LD', () => {
    const head = parseHead(goodHead())
    expect(head.html.lang).toBe('he')
    expect(head.html.dir).toBe('rtl')
    expect(head.title).toBe('שאלות נפוצות | קניון אקספרס')
    expect(head.metaByName.description).toEqual(['תשובות'])
    expect(head.metaByProperty['og:locale']).toEqual(['he_IL'])
    expect(head.links.find((l) => l.rel === 'canonical')?.href).toBe(`${ORIGIN}/faq`)
    expect(head.jsonLd).toHaveLength(1)
  })

  it('decodes entities in attribute values', () => {
    const head = parseHead(
      '<html><head><meta property="og:title" content="a &amp; b &quot;c&quot;"/></head></html>',
    )
    expect(head.metaByProperty['og:title']).toEqual(['a & b "c"'])
  })

  it('ignores scripts that are not JSON-LD', () => {
    const head = parseHead('<html><head><script>var x = 1</script></head></html>')
    expect(head.jsonLd).toEqual([])
  })
})

describe('auditDocument', () => {
  const url = `${ORIGIN}/faq`

  it('passes a document with everything a crawler needs', () => {
    expect(errors(auditDocument(goodHead(), { url }))).toEqual([])
  })

  it('fails on a missing canonical', () => {
    const html = goodHead().replace(/<link rel="canonical"[^>]*>/, '')
    expect(errors(auditDocument(html, { url }))).toContain('canonical: 0 canonical links, want 1')
  })

  it('fails on two canonicals', () => {
    const html = goodHead({ extra: `<link rel="canonical" href="${ORIGIN}/faq"/>` })
    expect(errors(auditDocument(html, { url }))).toContain('canonical: 2 canonical links, want 1')
  })

  it('fails on a canonical with a query string', () => {
    const html = goodHead({ canonical: `${ORIGIN}/faq?x=1` })
    expect(errors(auditDocument(html, { url }))[0]).toMatch(/^canonical: carries a query/)
  })

  it('accepts production canonicals on a localhost fetch when --site names the origin', () => {
    const local = 'http://localhost:3325/faq'
    expect(errors(auditDocument(goodHead(), { url: local }))).toContain(
      `canonical: points off-origin: ${ORIGIN}/faq`,
    )
    expect(errors(auditDocument(goodHead(), { url: local, site: ORIGIN }))).toEqual([])
  })

  it('fails on a canonical that points off-origin', () => {
    const html = goodHead({ canonical: 'https://example.com/faq' })
    expect(errors(auditDocument(html, { url }))).toContain(
      'canonical: points off-origin: https://example.com/faq',
    )
  })

  it('fails when hreflang is missing or disagrees with the canonical', () => {
    const missing = goodHead().replace(/<link rel="alternate" hrefLang="x-default"[^>]*>/, '')
    expect(errors(auditDocument(missing, { url }))).toContain('hreflang: no hreflang="x-default"')

    const wrong = goodHead({ heIL: `${ORIGIN}/about` })
    expect(errors(auditDocument(wrong, { url }))).toContain(
      `hreflang: he-IL is ${ORIGIN}/about, canonical is ${ORIGIN}/faq`,
    )
  })

  it('fails when og:url differs from the canonical', () => {
    const html = goodHead({ ogUrl: `${ORIGIN}/about` })
    expect(errors(auditDocument(html, { url }))).toContain(
      `open-graph: og:url ${ORIGIN}/about differs from canonical ${ORIGIN}/faq`,
    )
  })

  it('fails on a missing og:image or a relative one', () => {
    const missing = goodHead().replace(/<meta property="og:image"[^>]*>/, '')
    expect(errors(auditDocument(missing, { url }))).toContain('open-graph: no og:image')
    const relative = goodHead({ ogImage: '/opengraph-image' })
    expect(errors(auditDocument(relative, { url }))).toContain(
      'open-graph: og:image not absolute: /opengraph-image',
    )
  })

  it('fails on the wrong locale, language or direction', () => {
    const html = goodHead()
      .replace('content="he_IL"', 'content="en_US"')
      .replace('lang="he" dir="rtl"', 'lang="en" dir="ltr"')
    const found = errors(auditDocument(html, { url }))
    expect(found).toContain('open-graph: og:locale is en_US, want he_IL')
    expect(found).toContain('lang: <html lang> is "en", want "he"')
    expect(found).toContain('dir: <html dir> is "ltr", want "rtl"')
  })

  it('fails on a missing Twitter card', () => {
    const html = goodHead().replace(/<meta name="twitter:card"[^>]*>/, '')
    expect(errors(auditDocument(html, { url }))).toContain('twitter: no twitter:card')
  })

  it('fails an indexable page that says noindex, and accepts it on a page that is meant to', () => {
    const html = goodHead({ robots: 'noindex, follow' })
    expect(errors(auditDocument(html, { url }))).toContain(
      'robots: indexable page carries noindex (noindex, follow)',
    )
    expect(errors(auditDocument(html, { url, indexable: false }))).toEqual([])
  })

  it('fails invalid structured data and names the block', () => {
    const html = goodHead({
      jsonLd: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage' }),
    })
    expect(errors(auditDocument(html, { url }))).toContain(
      'json-ld: block 1 (FAQPage) $.mainEntity: FAQPage needs at least one Question',
    )
  })

  it('fails unparseable structured data', () => {
    const html = goodHead({ jsonLd: '{oops' })
    expect(errors(auditDocument(html, { url }))[0]).toMatch(
      /^json-ld: block 1 \(unparsed\) \$: not valid JSON/,
    )
  })

  it('warns, not fails, on a page with no structured data', () => {
    const html = goodHead().replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
    const issues = auditDocument(html, { url })
    expect(errors(issues)).toEqual([])
    expect(issues.map((i) => i.check)).toContain('json-ld')
  })
})

describe('auditRobotsTxt', () => {
  const good = [
    'User-Agent: *',
    'Allow: /',
    ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    `Host: ${ORIGIN}`,
  ].join('\n')

  it('passes the robots this site serves', () => {
    const { issues, disallowed } = auditRobotsTxt(good, { origin: ORIGIN })
    expect(errors(issues)).toEqual([])
    expect(disallowed).toContain('/redeem/')
  })

  it('fails without a Sitemap line', () => {
    const { issues } = auditRobotsTxt(good.replace(/Sitemap:.*\n/, ''), { origin: ORIGIN })
    expect(errors(issues)).toContain('robots.txt: no Sitemap: line')
  })

  it('fails when a private prefix is no longer disallowed', () => {
    const { issues } = auditRobotsTxt(good.replace('Disallow: /redeem/\n', ''), { origin: ORIGIN })
    expect(errors(issues)).toContain('robots.txt: missing Disallow: /redeem/')
  })

  it('fails a blanket Disallow: /', () => {
    const { issues } = auditRobotsTxt(`${good}\nDisallow: /`, { origin: ORIGIN })
    expect(errors(issues)).toContain('robots.txt: Disallow: / blocks the whole site')
  })
})

describe('auditSitemapXml', () => {
  function entry(loc, { langs = true, lastmod = '2026-10-01T00:00:00.000Z' } = {}) {
    return `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>daily</changefreq><priority>0.8</priority>${
      langs
        ? `<xhtml:link rel="alternate" hreflang="he-IL" href="${loc}" /><xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />`
        : ''
    }</url>`
  }
  const wrap = (body) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>`

  it('passes a sitemap with same-origin locs and hreflang on every entry', () => {
    const xml = wrap(entry(`${ORIGIN}/`) + entry(`${ORIGIN}/category/spa`))
    const { issues, urls } = auditSitemapXml(xml, { origin: ORIGIN })
    expect(errors(issues)).toEqual([])
    expect(urls).toEqual([`${ORIGIN}/`, `${ORIGIN}/category/spa`])
  })

  it('fails an entry without hreflang', () => {
    const xml = wrap(entry(`${ORIGIN}/about`, { langs: false }))
    expect(errors(auditSitemapXml(xml, { origin: ORIGIN }).issues)).toContain(
      `sitemap: ${ORIGIN}/about has no hreflang="he-IL"`,
    )
  })

  it('fails a loc that robots.txt disallows', () => {
    const xml = wrap(entry(`${ORIGIN}/redeem/abc`))
    const { issues } = auditSitemapXml(xml, { origin: ORIGIN, disallowed: ['/redeem/'] })
    expect(errors(issues)).toContain(
      `sitemap: ${ORIGIN}/redeem/abc is listed but robots.txt disallows /redeem/`,
    )
  })

  it('fails off-origin and duplicate locs', () => {
    const xml = wrap(entry('https://example.com/x') + entry(`${ORIGIN}/a`) + entry(`${ORIGIN}/a`))
    const found = errors(auditSitemapXml(xml, { origin: ORIGIN }).issues)
    expect(found).toContain('sitemap: off-origin loc https://example.com/x')
    expect(found).toContain(`sitemap: duplicate loc ${ORIGIN}/a`)
  })

  it('fails a lastmod that is not a date', () => {
    const xml = wrap(entry(`${ORIGIN}/a`, { lastmod: 'yesterday' }))
    expect(errors(auditSitemapXml(xml, { origin: ORIGIN }).issues)).toContain(
      `sitemap: ${ORIGIN}/a lastmod is not a date: yesterday`,
    )
  })

  it('fails a body that is not a urlset', () => {
    expect(errors(auditSitemapXml('<html></html>', { origin: ORIGIN }).issues)[0]).toMatch(
      /^sitemap: no <urlset>/,
    )
  })
})

describe('pickPaths', () => {
  it('adds one representative per dynamic family from the sitemap', () => {
    const urls = [
      `${ORIGIN}/`,
      `${ORIGIN}/category/spa`,
      `${ORIGIN}/category/food`,
      `${ORIGIN}/product/massage`,
      `${ORIGIN}/s/abc`,
      `${ORIGIN}/city/%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91`,
    ]
    const paths = pickPaths(urls, ORIGIN)
    for (const p of STATIC_PATHS) expect(paths).toContain(p)
    expect(paths).toContain('/category/spa')
    expect(paths).not.toContain('/category/food')
    expect(paths).toContain('/product/massage')
    expect(paths).toContain('/s/abc')
    expect(paths).toContain('/city/%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91')
  })

  it('has no duplicates', () => {
    const paths = pickPaths([`${ORIGIN}/`], ORIGIN)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
