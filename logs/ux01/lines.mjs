import sharp from 'sharp'
// scan a column (or row) for non-white runs and print their start positions
const [, , file, axis, pos, from, to, thr = '240'] = process.argv
const img = sharp(file)
const { width } = await img.metadata()
const raw = await img.removeAlpha().raw().toBuffer()
const px = (x, y) => {
  const i = (y * width + x) * 3
  return [raw[i], raw[i + 1], raw[i + 2]]
}
const runs = []
let inRun = false
for (let t = +from; t < +to; t++) {
  const [r, g, b] = axis === 'col' ? px(+pos, t) : px(t, +pos)
  const dark = r < +thr || g < +thr || b < +thr
  if (dark && !inRun) {
    runs.push([t, [r, g, b]])
    inRun = true
  }
  if (!dark) inRun = false
}
console.log(file, axis, pos, runs.map(([t, c]) => `${t}(${c.join(',')})`).join(' '))
