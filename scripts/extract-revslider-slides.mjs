import fs from 'fs'

const html = fs.readFileSync('refs/ke_live_home.html', 'utf8')

const LOCAL = {
  'ios13-iphone-11pro-airpods-pro-setup-animation-steps.gif':
    '/images/hero/slider/ios13-iphone-11pro-airpods-pro-setup-animation-steps.gif',
  'redPhone-1-1.png': '/images/hero/slider/redPhone-1-1.png',
  Smartwatches1: '/images/hero/slider/Smartwatches1.png',
  'Smartwatches1.png': '/images/hero/slider/Smartwatches1.png',
  'iapdlap.png': '/images/hero/slider/iapdlap.png',
  'Screen-Shot-2021-11-12-at-0.20.17.png':
    '/images/hero/slider/Screen-Shot-2021-11-12-at-0.20.17.png',
  'Screen-Shot-2021-11-09-at-6.41.46.png':
    '/images/hero/slider/Screen-Shot-2021-11-09-at-6.41.46.png',
}
const localPath = (url) => LOCAL[url?.split('/').pop()] || null

const TEXT_OVERRIDES_OTHER = {
  'slider-6-slide-18-layer-3': 'לקניון Express',
  'slider-6-slide-18-layer-7': 'BEST',
  'slider-6-slide-20-layer-4': 'THE NEW STANDARD',
  'slider-6-slide-20-layer-5': 'SIMPLY THE',
  'slider-6-slide-33-layer-4': 'THE NEW STANDARD',
  'slider-6-slide-33-layer-5': 'SIMPLY THE',
}
const TEXT_OVERRIDES_35 = {
  'slider-6-slide-35-layer-2': 'PREMIUM',
  'slider-6-slide-35-layer-3': 'PRODUCT',
  'slider-6-slide-35-layer-4': 'THE NEW STANDARD',
  'slider-6-slide-35-layer-5': 'SIMPLY THE',
}
const REV_LAYER_TEXT_OVERRIDES = { ...TEXT_OVERRIDES_OTHER, ...TEXT_OVERRIDES_35 }

const slideBlocks = [...html.matchAll(/<rs-slide[^>]*data-key="(rs-\d+)"[\s\S]*?<\/rs-slide>/g)]
const slides = slideBlocks.map((m) => {
  const key = m[1]
  const block = m[0]
  const bg = block.match(/data-bg="([^"]*)"/)?.[1] ?? null
  const layers = []
  const re = /<(rs-layer|span)(\s[\s\S]*?)>([\s\S]*?)<\/\1>/g
  let lm
  while ((lm = re.exec(block))) {
    const attrs = lm[2]
    const inner = lm[3]
    const rawText = inner
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const id = attrs.match(/\bid="([^"]*)"/)?.[1] || ''
    const type = attrs.match(/data-type="([^"]*)"/)?.[1] || 'text'
    const lazyLayer = attrs.match(/data-lazyload="([^"]*)"/)?.[1]
    const lazyImg = inner.match(/data-lazyload="([^"]*)"/)?.[1]
    layers.push({
      id,
      type,
      text: REV_LAYER_TEXT_OVERRIDES[id] || rawText,
      dataColor: attrs.match(/data-color="([^"]*)"/)?.[1] ?? null,
      dataText: attrs.match(/data-text="([^"]*)"/)?.[1] ?? null,
      dataXy: attrs.match(/data-xy="([^"]*)"/)?.[1] ?? null,
      dataDim: attrs.match(/data-dim="([^"]*)"/)?.[1] ?? null,
      image: localPath(lazyLayer) || localPath(lazyImg),
      zIndex: attrs.match(/z-index:\s*(\d+)/)?.[1] ?? null,
    })
  }
  return { key, bg, layers }
})

const EN_LTR = [
  'slider-6-slide-18-layer-5',
  'slider-6-slide-18-layer-7',
  'slider-6-slide-35-layer-2',
  'slider-6-slide-35-layer-3',
  'slider-6-slide-35-layer-4',
  'slider-6-slide-35-layer-5',
  'slider-6-slide-35-layer-7',
  'slider-6-slide-20-layer-4',
  'slider-6-slide-20-layer-5',
  'slider-6-slide-20-layer-7',
  'slider-6-slide-33-layer-4',
  'slider-6-slide-33-layer-5',
  'slider-6-slide-33-layer-7',
]

let out = `/** Auto-extracted from refs/ke_live_home.html (753KB) */\n\n`
out += `export type RevLayer = {\n  id: string\n  type: string\n  text: string\n  dataColor: string | null\n  dataText: string | null\n  dataXy: string | null\n  dataDim: string | null\n  image: string | null\n  zIndex: string | null\n}\n\n`
out += `export type RevSlide = { key: string; bg: string | null; layers: RevLayer[] }\n\n`
out += `export const RS_PREMIUM_SLIDE_KEY = 'rs-35'\n\n`
out += `export const REV_LAYER_TEXT_OVERRIDES: Record<string, string> = ${JSON.stringify(REV_LAYER_TEXT_OVERRIDES, null, 2)}\n\n`
out += `export const REV_LAYER_TEXT_OVERRIDES_OTHER: Record<string, string> = ${JSON.stringify(TEXT_OVERRIDES_OTHER, null, 2)}\n\n`
out += `export const REV_LAYER_LTR: Set<string> = new Set(${JSON.stringify(EN_LTR)})\n\n`
out += `export const KE_LIVE_REV_SLIDES: RevSlide[] = ${JSON.stringify(slides, null, 2)}\n`
fs.writeFileSync('src/lib/ke-live-revslider-slides.ts', out)

for (const s of slides) {
  const imgs = s.layers.filter((l) => l.image).map((l) => `${l.id}:${l.image.split('/').pop()}`)
  console.log(s.key, imgs.join(', ') || '(no images)')
}
