import sharp from 'sharp'
const file = process.argv[2]
const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
const W = info.width
const C = info.channels
const px = (x, y) => {
  const i = (y * W + x) * C
  return [data[i], data[i + 1], data[i + 2]]
}
const dark = (p) => p[0] < 120 && p[1] < 120 && p[2] < 120
const yellow = (p) => p[0] > 230 && p[1] > 190 && p[2] < 80
const nonwhite = (p) => !(p[0] > 250 && p[1] > 250 && p[2] > 250)
function extent(x0, x1, y0, y1, pred) {
  let minx = Number.POSITIVE_INFINITY
  let maxx = -1
  let miny = Number.POSITIVE_INFINITY
  let maxy = -1
  let n = 0
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (pred(px(x, y))) {
        n++
        minx = Math.min(minx, x)
        maxx = Math.max(maxx, x)
        miny = Math.min(miny, y)
        maxy = Math.max(maxy, y)
      }
  return n ? { x: [minx, maxx], y: [miny, maxy], n } : null
}
const blocks = JSON.parse(process.argv[3])
const X = JSON.parse(process.argv[4])
for (const [y0, y1] of blocks) {
  console.log(`block y${y0}-${y1}`)
  console.log('  dark   ', JSON.stringify(extent(X[0], X[1], y0, y1, dark)))
  console.log('  yellow ', JSON.stringify(extent(X[0], X[1], y0, y1, yellow)))
  console.log('  paint  ', JSON.stringify(extent(X[0], X[1], y0, y1, nonwhite)))
  // per text line: dark rows
  const runs = []
  let cur = null
  for (let y = y0; y <= y1; y++) {
    const e = extent(X[0], X[1], y, y, dark)
    if (e && !cur) cur = { y0: y, y1: y, x0: e.x[0], x1: e.x[1] }
    else if (e && cur) {
      cur.y1 = y
      cur.x0 = Math.min(cur.x0, e.x[0])
      cur.x1 = Math.max(cur.x1, e.x[1])
    } else if (!e && cur) {
      runs.push(cur)
      cur = null
    }
  }
  if (cur) runs.push(cur)
  for (const r of runs)
    console.log(`    dark rows y${r.y0}-${r.y1} (${r.y1 - r.y0 + 1}) x${r.x0}-${r.x1}`)
}
