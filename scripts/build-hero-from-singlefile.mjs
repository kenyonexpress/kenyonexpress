/**
 * Build hero 1:1 from refs/ke_live_singlefile.html ONLY.
 * Iron rule: no live capture, no invented DOM.
 */
import fs from 'fs'
import path from 'path'

const SINGLEFILE = 'refs/ke_live_singlefile.html'
const html = fs.readFileSync(SINGLEFILE, 'utf8')

function extractHeroSection(source) {
  const pat =
    '<div class="elementor-section elementor-top-section elementor-element elementor-element-1b49fac0'
  const start = source.indexOf(pat)
  if (start < 0) throw new Error('hero section not found')
  let depth = 0
  let end = start
  for (let i = start; i < source.length; i++) {
    if (source.slice(i, i + 4) === '<div') depth++
    if (source.slice(i, i + 6) === '</div>') {
      depth--
      if (depth === 0) {
        end = i + 6
        break
      }
    }
  }
  return source.slice(start, end)
}

function parseLayers(slideHtml) {
  const layers = []
  const re =
    /<(?:rs-layer\s|span\s)([^>]*\bid=slider-6-slide-[^ >\s]+[^>]*)>([\s\S]*?)<\/(?:rs-layer|span)>/g
  let m
  while ((m = re.exec(slideHtml))) {
    const attrs = m[1]
    const type = attrs.match(/data-type=(\w+)/)?.[1]
    const style =
      attrs.match(/style="([^"]*)"/)?.[1] ||
      attrs.match(/style='([^']*)'/)?.[1] ||
      ''
    const dataXy = attrs.match(/data-xy=([^ >]+)/)?.[1]
    const dataColor = attrs.match(/data-color=(#[0-9a-fA-F]+)/)?.[1]
    const dataText = attrs.match(/data-text=([^ >]+)/)?.[1]
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!type) continue
    layers.push({
      id: (attrs.match(/\bid=(slider-6-slide-[^ >\s]+)/) || [])[1],
      type,
      text,
      fontSize: style.match(/font-size:\s*([^;]+)/)?.[1]?.trim(),
      color: style.match(/color:\s*([^;]+)/)?.[1]?.trim() || dataColor,
      top: style.match(/top:\s*([^;]+)/)?.[1]?.trim(),
      left: style.match(/left:\s*([^;]+)/)?.[1]?.trim(),
      dataXy,
      dataText,
    })
  }
  return layers
}

let hero = extractHeroSection(html)
hero = hero.replace(/\s+sf-hidden/g, '')
hero = hero.replace(/<script[\s\S]*?<\/script>/gi, '')

const savedB64 = new Map()

function heroSubfolder(name) {
  const n = name.toLowerCase()
  if (n.includes('tesla') || n.includes('apple-140') || n.includes('home-sl-da')) return 'side-banners'
  if (
    n.includes('e-baby') ||
    n.includes('student-') ||
    n.includes('maldives') ||
    n.includes('golden-retriever') ||
    n.includes('cute-golden')
  )
    return 'category'
  return 'slider'
}

function localPathFromUrl(url) {
  if (!url || url.startsWith('data:') || url.startsWith('/images/hero/')) return url
  const clean = url.replace(/^\/\//, 'https://').split('?')[0]
  const base = path.basename(clean)
  if (!base || base === 'transparent.png' || base === 'dummy.png') return url
  return `/images/hero/${heroSubfolder(base)}/${base}`
}

function saveBase64(dataUrl, hintUrl) {
  if (savedB64.has(dataUrl)) return savedB64.get(dataUrl)
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
  if (!m) return dataUrl
  let filename
  if (hintUrl && !hintUrl.startsWith('data:')) {
    filename = path.basename(hintUrl.split('?')[0])
  } else {
    const hash = Buffer.from(m[2].slice(0, 48)).toString('base64url').slice(0, 10)
    filename = `sf-${hash}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
  }
  if (filename === 'transparent.png' || filename === 'dummy.png') return dataUrl
  const local = `/images/hero/${heroSubfolder(filename)}/${filename}`
  const filePath = path.join('public', local)
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, Buffer.from(m[2], 'base64'))
    console.log('b64 ->', local)
  }
  savedB64.set(dataUrl, local)
  return local
}

hero = hero.replace(/<img\b[^>]*>/gi, (tag) => {
  const ref =
    tag.match(/data-reference="([^"]+)"/)?.[1] ||
    tag.match(/data-src-rs-ref="([^"]+)"/)?.[1] ||
    tag.match(/data-lazyload="([^"]+)"/)?.[1] ||
    tag.match(/data-lazy-src="([^"]+)"/)?.[1]
  const src = tag.match(/\bsrc="([^"]+)"/)?.[1]
  if (src?.startsWith('data:image')) {
    const local = saveBase64(src, ref)
    return tag
      .replace(/src="data:image[^"]+"/, `src="${local}"`)
      .replace(/data-lazyload="data:image[^"]+"/, `data-lazyload="${local}"`)
      .replace(/data-lazy-src="data:image[^"]+"/, `data-lazy-src="${local}"`)
      .replace(/data-reference="[^"]+"/, `data-reference="${local}"`)
      .replace(/data-src-rs-ref="[^"]+"/, `data-src-rs-ref="${local}"`)
  }
  if (ref && !ref.startsWith('data:')) {
    const local = localPathFromUrl(ref)
    let t = tag
    for (const attr of ['src', 'data-lazyload', 'data-lazy-src', 'data-reference', 'data-src-rs-ref']) {
      if (t.includes(`${attr}=`)) t = t.replace(new RegExp(`${attr}="[^"]*"`), `${attr}="${local}"`)
    }
    return t
  }
  return tag
})

hero = hero.replace(/url\(data:image\/[^)]+\)/g, (u) => `url(${saveBase64(u.slice(4, -1), null)})`)
hero = hero.replace(/https?:\/\/kenyonexpress\.co\.il\/wp-content\/uploads\/[^"'\s)>]+/g, (u) =>
  localPathFromUrl(u),
)
hero = hero.replace(/\/\/kenyonexpress\.co\.il\/wp-content\/uploads\/[^"'\s)>]+/g, (u) =>
  localPathFromUrl('https:' + u),
)

fs.writeFileSync('refs/ke_live_singlefile-hero.html', hero)

const slides = []
for (const sm of hero.matchAll(/<rs-slide[^>]*data-key=(rs-\d+)[\s\S]*?<\/rs-slide>/g)) {
  const key = sm[1]
  const layers = parseLayers(sm[0])
  slides.push({ key, layers })
}

const banners = []
for (const bm of hero.matchAll(/<div class="da-inner[\s\S]*?<\/a>/g)) {
  const block = bm[0]
  banners.push({
    text: block.match(/<div class="da-text">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null,
    action: block.match(/<div class="da-action">([\s\S]*?)<\/div>/)?.[1]?.trim() || null,
  })
}

const categories = [...hero.matchAll(/<li[^>]*class="[^"]*menu-item[^"]*"[^>]*><a[^>]*title="([^"]*)"/g)].map(
  (m) => m[1],
)

fs.writeFileSync(
  'refs/ke_live_singlefile-hero-extract.json',
  JSON.stringify({ slides, banners, categories, sourceOnly: true }, null, 2),
)

const classTokens = new Set(['elementor-5202', 'elementor', 'elementor-page'])
for (const m of hero.matchAll(/class="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) classTokens.add(c)
}
for (const m of hero.matchAll(/class=([a-zA-Z0-9_-]+)/g)) classTokens.add(m[1])

const allCss = html.match(/<style id=wpr-usedcss>([\s\S]*?)<\/style>/)?.[1] || ''
const heroIds = ['1b49fac0', '7e293eca', '7072159f', '45c00b23', 'rev_slider_6_1', '4fd2762a', 'elementor-5202']

const rules = []
for (const rule of allCss.split('}')) {
  if (!rule.includes('{')) continue
  const sel = rule.split('{')[0]
  const hit =
    heroIds.some((id) => sel.includes(id)) ||
    [...classTokens].some((c) => c.length > 2 && sel.includes(`.${c}`)) ||
    /rev_slider|rs-layer|rs-slide|rs-module|tp-bullet|da-block|da-inner|da-action|da-text|da-media|departments-menu|product-categories|elementor-column|elementor-container/.test(
      sel,
    )
  if (hit) rules.push(rule.trim() + '}')
}

let css = `.ke-hero-exact-root.elementor-5202{--bs-ec-primary:#fed700;font-family:var(--font-heebo),"Open Sans",Arial,sans-serif;direction:rtl;width:100%}\n`
css += rules
  .map((rule) => {
    const idx = rule.indexOf('{')
    const sel = rule.slice(0, idx)
    const body = rule.slice(idx + 1)
    const scoped = sel
      .split(',')
      .map((s) => {
        const t = s.trim()
        if (t.startsWith('.elementor-5202')) return `.ke-hero-exact-root${t.slice('.elementor-5202'.length)}`
        return `.ke-hero-exact-root ${t}`
      })
      .join(',')
    return `${scoped}{${body}`
  })
  .join('\n')

fs.mkdirSync('src/styles', { recursive: true })
fs.writeFileSync('src/styles/hero-exact.css', css)

const escaped = hero.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
fs.writeFileSync(
  'src/lib/hero-exact-html.ts',
  `/** Generated from refs/ke_live_singlefile.html — do not edit by hand */\nexport const HERO_EXACT_HTML = \`${escaped}\`\n`,
)

console.log('hero bytes:', hero.length)
console.log('css rules:', rules.length)
slides.forEach((s) => {
  const textLayers = s.layers.filter((l) => l.type === 'text' && l.text)
  console.log(
    s.key,
    textLayers.length ? textLayers.map((l) => `${l.text}@${l.fontSize || l.dataText || '?'}`).join(' | ') : '(empty in file)',
  )
})
console.log('banners in file:', banners.filter((b) => b.text).length)
console.log('categories in file:', categories.length)
