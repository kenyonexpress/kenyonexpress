import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Baseline of the OLD live site (kenyonexpress.co.il) into ~/Downloads:
//   baseline-old-site-performance.md  Lighthouse mobile: 4 scores + Core Web Vitals
//   baseline-old-site-pages.md        every URL from the sitemap, for 301 redirects
//   baseline-old-site-seo.md          title + meta description of the main pages
//
// Run from the desktop terminal (needs internet; lighthouse runs via npx):
//   node scripts/baseline-old-site.mjs

const SITE = 'https://kenyonexpress.co.il'
const OUT = join(homedir(), 'Downloads')
const today = new Date().toISOString().slice(0, 10)

const save = (name, content) => {
  writeFileSync(join(OUT, name), content)
  console.error(`✓ ${join(OUT, name)}`)
}

// ---------- 1. Lighthouse (mobile) ----------
{
  console.error('Running Lighthouse (mobile preset), this takes ~1 min…')
  const jsonPath = join(OUT, 'lighthouse-old-site.json')
  try {
    execSync(
      `npx -y lighthouse "${SITE}/" --output=json --output-path="${jsonPath}" ` +
      '--form-factor=mobile --screenEmulation.mobile --quiet --chrome-flags="--headless=new"',
      { stdio: ['ignore', 'inherit', 'inherit'], timeout: 300000 },
    )
  } catch (e) {
    console.error('lighthouse run failed:', e.message)
  }
  if (existsSync(jsonPath)) {
    const r = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const pct = (c) => (r.categories[c] ? Math.round(r.categories[c].score * 100) : 'n/a')
    const audit = (id) => (r.audits[id] ? r.audits[id].displayValue || r.audits[id].numericValue : 'n/a')
    save('baseline-old-site-performance.md', [
      `# Baseline: old site performance (Lighthouse mobile, ${today})`,
      '',
      `URL: ${SITE}/`,
      '',
      '## Scores',
      '',
      '| category | score |',
      '|---|---|',
      `| Performance | ${pct('performance')} |`,
      `| Accessibility | ${pct('accessibility')} |`,
      `| Best Practices | ${pct('best-practices')} |`,
      `| SEO | ${pct('seo')} |`,
      '',
      '## Core Web Vitals + key metrics',
      '',
      '| metric | value |',
      '|---|---|',
      `| First Contentful Paint | ${audit('first-contentful-paint')} |`,
      `| Largest Contentful Paint | ${audit('largest-contentful-paint')} |`,
      `| Total Blocking Time | ${audit('total-blocking-time')} |`,
      `| Cumulative Layout Shift | ${audit('cumulative-layout-shift')} |`,
      `| Speed Index | ${audit('speed-index')} |`,
      `| Time to Interactive | ${audit('interactive')} |`,
      '',
      `Full JSON report: lighthouse-old-site.json (same folder).`,
      '',
    ].join('\n'))
  } else {
    save('baseline-old-site-performance.md', `# Baseline: old site performance\n\nLighthouse run failed on ${today}. Re-run: npx -y lighthouse ${SITE}/ --form-factor=mobile\n`)
  }
}

// ---------- helpers ----------
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (baseline-audit)' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].trim())

// ---------- 2. all pages from sitemap ----------
let allUrls = []
{
  const candidates = [
    `${SITE}/sitemap_index.xml`, `${SITE}/sitemap.xml`, `${SITE}/wp-sitemap.xml`,
  ]
  let rootXml = null; let rootUrl = null
  for (const c of candidates) {
    try { rootXml = await fetchText(c); rootUrl = c; break } catch {}
  }
  if (rootXml) {
    const first = locs(rootXml)
    const isIndex = first.some((u) => u.endsWith('.xml'))
    if (isIndex) {
      for (const sm of first) {
        try { allUrls.push(...locs(await fetchText(sm)).filter((u) => !u.endsWith('.xml'))) } catch (e) { console.error('  sub-sitemap failed:', e.message) }
      }
    } else {
      allUrls = first
    }
    allUrls = [...new Set(allUrls)]
    const group = (re) => allUrls.filter((u) => re.test(u))
    const products = group(/\/product\//)
    const cats = group(/\/product-category\//)
    const rest = allUrls.filter((u) => !products.includes(u) && !cats.includes(u))
    const L = [`# Baseline: old site pages (${today})`, '', `Sitemap root: ${rootUrl}`, `Total URLs: ${allUrls.length}`, '',
      `## Pages (${rest.length})`, '', ...rest.map((u) => `- ${u}`),
      '', `## Product categories (${cats.length})`, '', ...cats.map((u) => `- ${u}`),
      '', `## Products (${products.length})`, '', ...products.map((u) => `- ${u}`), '']
    save('baseline-old-site-pages.md', L.join('\n'))
  } else {
    save('baseline-old-site-pages.md', `# Baseline: old site pages\n\nNo sitemap found on ${today} (tried sitemap_index.xml, sitemap.xml, wp-sitemap.xml). Crawl manually or check robots.txt for the sitemap location.\n`)
  }
}

// ---------- 3. title + description of main pages ----------
{
  const main = allUrls.filter((u) => !/\/product\//.test(u)).slice(0, 10)
  if (!main.length) main.push(`${SITE}/`)
  const rows = []
  for (const u of main) {
    try {
      const html = await fetchText(u)
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim().replace(/\s+/g, ' ') || ''
      const desc = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
        || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i) || [])[1] || ''
      const ogTitle = (html.match(/property=["']og:title["']\s+content=["']([^"']*)["']/i) || [])[1] || ''
      rows.push({ u, title, desc, ogTitle })
      console.error(`  ✓ ${u}`)
    } catch (e) { rows.push({ u, title: `FETCH FAILED: ${e.message}`, desc: '', ogTitle: '' }) }
  }
  const L = [`# Baseline: old site SEO (${today})`, '', '| URL | title | meta description | og:title |', '|---|---|---|---|']
  for (const r of rows) L.push(`| ${r.u} | ${r.title.replace(/\|/g, '\\|')} | ${r.desc.replace(/\|/g, '\\|')} | ${r.ogTitle.replace(/\|/g, '\\|')} |`)
  save('baseline-old-site-seo.md', L.join('\n') + '\n')
}

console.error('Done. 3 files in ~/Downloads')
