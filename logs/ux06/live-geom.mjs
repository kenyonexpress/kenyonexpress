// Read the live 1440 capture's promo column: column bounds, hairlines, text/image extents.
import sharp from 'sharp'
const [, , file, x0s, x1s, y0s, y1s] = process.argv
const x0 = +x0s
const x1 = +x1s
const y0 = +y0s
const y1 = +y1s
const img = sharp(file)
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
const W = info.width
const C = info.channels
const px = (x, y) => {
  const i = (y * W + x) * C
  return [data[i], data[i + 1], data[i + 2]]
}
const isWhite = ([r, g, b]) => r > 250 && g > 250 && b > 250
const isGrey = ([r, g, b]) => Math.abs(r - g) < 6 && Math.abs(g - b) < 6 && r > 215 && r < 240
// rows: for each y, count non-white and grey pixels in x0..x1
const rows = []
for (let y = y0; y < y1; y++) {
  let nw = 0
  let gr = 0
  let dark = 0
  let minx = Number.POSITIVE_INFINITY
  let maxx = -1
  for (let x = x0; x < x1; x++) {
    const p = px(x, y)
    if (!isWhite(p)) {
      nw++
      minx = Math.min(minx, x)
      maxx = Math.max(maxx, x)
    }
    if (isGrey(p)) gr++
    if (p[0] < 120 && p[1] < 120 && p[2] < 120) dark++
  }
  rows.push({
    y,
    nw,
    gr,
    dark,
    minx: minx === Number.POSITIVE_INFINITY ? null : minx,
    maxx: maxx < 0 ? null : maxx,
  })
}
// hairlines: rows where grey count >= 60% of width
const hair = rows.filter((r) => r.gr > (x1 - x0) * 0.6).map((r) => r.y)
console.log('hairline rows:', hair.join(','))
// print compact row runs of "has dark text"
const runs = []
let cur = null
for (const r of rows) {
  const on = r.dark > 0
  if (on && !cur) cur = { y0: r.y, y1: r.y, minx: r.minx, maxx: r.maxx }
  else if (on && cur) {
    cur.y1 = r.y
    cur.minx = Math.min(cur.minx, r.minx)
    cur.maxx = Math.max(cur.maxx, r.maxx)
  } else if (!on && cur) {
    runs.push(cur)
    cur = null
  }
}
if (cur) runs.push(cur)
console.log('dark runs (text/image):')
for (const r of runs) console.log(`  y${r.y0}-${r.y1} (${r.y1 - r.y0 + 1}px) x${r.minx}-${r.maxx}`)
// column profile: for each x, count non-white in y0..y1
console.log('non-white per x (first/last columns with any paint):')
let first = null
let last = null
for (let x = x0; x < x1; x++) {
  let n = 0
  for (let y = y0; y < y1; y++) if (!isWhite(px(x, y))) n++
  if (n > 0) {
    if (first === null) first = x
    last = x
  }
}
console.log('  x', first, '..', last)
