import fs from 'fs'
import path from 'path'

const html = fs.readFileSync('refs/ke_live_singlefile.html', 'utf8')

// Hero section: elementor-element-1b49fac0 through closing of its outer section
const marker = 'elementor-element-1b49fac0'
const startIdx = html.indexOf(`elementor-section elementor-top-section elementor-element ${marker}`)
if (startIdx < 0) throw new Error('hero section not found')

let depth = 0
let started = false
let endIdx = startIdx
for (let i = startIdx; i < html.length; i++) {
  if (html.slice(i, i + 4) === '<div') {
    depth++
    started = true
  } else if (html.slice(i, i + 6) === '</div>') {
    depth--
    if (started && depth === 0) {
      endIdx = i + 6
      break
    }
  }
}

let hero = html.slice(startIdx, endIdx)

const IMAGE_MAP = new Map()
function mapImage(url) {
  if (!url || url.startsWith('data:') || url.startsWith('/images/hero/')) return url
  const clean = url.replace(/^\/\//, 'https://').split('?')[0]
  const base = path.basename(clean)
  if (!base || base === 'dummy.png' || base === 'transparent.png') return url
  const local = `/images/hero/slider/${base}`
  IMAGE_MAP.set(clean, local)
  // side banners / category
  if (url.includes('side-banners') || url.includes('uploads')) {
    const sub = url.includes('apple') ? 'side-banners' : url.includes('tesla') ? 'side-banners' : url.includes('home-sl') ? 'side-banners' : url.includes('category') ? 'category' : 'slider'
    const local2 = `/images/hero/${sub}/${base}`
    IMAGE_MAP.set(clean, local2)
    return local2
  }
  return local
}

function rewriteUrls(fragment) {
  return fragment
    .replace(/https?:\/\/kenyonexpress\.co\.il\/wp-content\/uploads\/[^"'\s)]+/g, (u) => mapImage(u))
    .replace(/\/\/kenyonexpress\.co\.il\/wp-content\/uploads\/[^"'\s)]+/g, (u) => mapImage('https:' + u))
    .replace(/data-lazyload="\/\/[^"]+"/g, (m) => {
      const u = m.match(/data-lazyload="([^"]+)"/)[1]
      return `data-lazyload="${mapImage(u.startsWith('//') ? 'https:' + u : u)}"`
    })
    .replace(/src="\/\/kenyonexpress\.co\.il\/wp-content\/uploads\/[^"]+"/g, (m) => {
      const u = m.match(/src="([^"]+)"/)[1]
      return `src="${mapImage('https:' + u)}"`
    })
}

hero = rewriteUrls(hero)

// Extract slide data from initialized DOM
const slides = []
for (const sm of hero.matchAll(/data-key="(rs-\d+)"[\s\S]*?<\/rs-slide>/g)) {
  const key = sm[1]
  const block = sm[0]
  const layers = []
  for (const lm of block.matchAll(/<rs-layer id="([^"]+)"[^>]*data-type="([^"]*)"[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/rs-layer>/g)) {
    const text = lm[4].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const style = lm[3]
    const fontSize = style.match(/font-size:\s*([^;]+)/)?.[1]?.trim()
    const color = style.match(/(?:^|;\s*)color:\s*([^;]+)/)?.[1]?.trim()
    const top = style.match(/(?:^|;\s*)top:\s*([^;]+)/)?.[1]?.trim()
    const left = style.match(/(?:^|;\s*)left:\s*([^;]+)/)?.[1]?.trim()
    layers.push({ id: lm[1], type: lm[2], text, fontSize, color, top, left })
  }
  slides.push({ key, layers })
}

// Banner blocks
const banners = []
for (const bm of hero.matchAll(/<div class="da-inner[\s\S]*?<\/div>\s*<\/div>/g)) {
  const block = bm[0]
  const title = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1]?.replace(/<[^>]+>/g, '').trim()
  const subtitle = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, '').trim()
  const img = block.match(/(?:src|data-lazyload|data-src)="([^"]+)"/)?.[1]
  const btnStyle = block.match(/class="[^"]*da-action[^"]*"[^>]*style="([^"]*)"/)?.[1]
  banners.push({ title, subtitle, img, btnStyle })
}

// Category menu items
const categories = []
for (const cm of hero.matchAll(/<li[^>]*class="[^"]*menu-item[^"]*"[^>]*><a[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/li>/g)) {
  categories.push({ title: cm[1], text: cm[2].replace(/<[^>]+>/g, '').trim() })
}

fs.writeFileSync('refs/ke_live_singlefile-hero.html', hero)
fs.writeFileSync('refs/ke_live_singlefile-hero-extract.json', JSON.stringify({ slides, banners, categories, images: [...IMAGE_MAP.entries()] }, null, 2))

console.log('hero bytes:', hero.length)
console.log('slides:', slides.length)
slides.forEach((s) => console.log(s.key, s.layers.filter((l) => l.type === 'text').map((l) => `${l.text}@${l.fontSize}`).join(' | ')))
console.log('banners:', banners.length, banners.map((b) => b.title))
console.log('categories:', categories.length)
console.log('images to download:', IMAGE_MAP.size)
