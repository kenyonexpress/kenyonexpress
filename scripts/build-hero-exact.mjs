import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const heroPath = 'refs/ke_live_singlefile-hero.html'
const cssPath = 'refs/ke_live_singlefile-hero.css'
let hero = fs.readFileSync(heroPath, 'utf8')

// Fix category image paths
hero = hero.replace(/\/images\/hero\/slider\/(e-baby-d2[^"'\s]*)/g, '/images/hero/category/$1')
hero = hero.replace(/\/images\/hero\/slider\/(student-[^"'\s]*)/g, '/images/hero/category/$1')
hero = hero.replace(/\/images\/hero\/slider\/(maldives-[^"'\s]*)/g, '/images/hero/category/$1')
hero = hero.replace(/\/images\/hero\/slider\/(cute-golden[^"'\s]*)/g, '/images/hero/category/$1')
hero = hero.replace(
  /\/images\/hero\/slider\/(tesla-logo-main[^"'\s]*)/g,
  '/images/hero/side-banners/$1',
)
hero = hero.replace(
  /\/images\/hero\/slider\/(apple-140-new[^"'\s]*)/g,
  '/images/hero/side-banners/$1',
)
hero = hero.replace(
  /\/images\/hero\/slider\/(home-sl-da-3[^"'\s]*)/g,
  '/images/hero/side-banners/$1',
)

// Strip scripts
hero = hero.replace(/<script[\s\S]*?<\/script>/gi, '')

// Collect image URLs to ensure exist
const urls = new Set()
for (const m of hero.matchAll(/\/images\/hero\/[^"'\s)]+/g)) urls.add(m[0].split('?')[0])

const outDir = 'public'
for (const local of urls) {
  const file = path.join(outDir, local)
  if (fs.existsSync(file)) continue
  const base = path.basename(local)
  let remote = `https://kenyonexpress.co.il/wp-content/uploads/2021/11/${base}`
  if (local.includes('side-banners')) {
    const map = {
      'tesla-logo-main.webp': '2021/11/tesla-logo-main.webp',
      'apple-140-new.webp': '2021/11/apple-140-new.webp',
      'home-sl-da-3.webp': '2021/11/home-sl-da-3.webp',
    }
    remote = `https://kenyonexpress.co.il/wp-content/uploads/${map[base] || `2021/11/${base}`}`
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  try {
    execSync(`curl -fsSL -o "${file}" "${remote}"`, { stdio: 'pipe' })
    console.log('downloaded', local)
  } catch {
    console.warn('missing', local, remote)
  }
}

// Scope CSS
let css = fs.readFileSync(cssPath, 'utf8')
css = `.ke-hero-exact-root {\n  --bs-ec-primary: #fed700;\n  font-family: var(--font-heebo), "Open Sans", Arial, sans-serif;\n}\n${css
  .split('\n')
  .filter(Boolean)
  .map((rule) => {
    if (!rule.includes('{')) return rule
    const [sel, body] = rule.split('{')
    const scoped = sel
      .split(',')
      .map((s) => `.ke-hero-exact-root ${s.trim()}`)
      .join(',')
    return `${scoped}{${body}`
  })
  .join('\n')}`

fs.mkdirSync('src/styles', { recursive: true })
fs.writeFileSync('src/styles/hero-exact.css', css)

const escaped = hero.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

fs.writeFileSync(
  'src/lib/hero-exact-html.ts',
  `/** Generated from refs/ke_live_singlefile.html — do not edit by hand */\nexport const HERO_EXACT_HTML = \`${escaped}\`\n`,
)

console.log('wrote hero-exact-html.ts', hero.length, 'bytes')
console.log('wrote hero-exact.css', css.length, 'bytes')
