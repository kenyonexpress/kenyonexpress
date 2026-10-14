import sharp from 'sharp'
const [, , file, x0, x1, y0, y1, thr = '240'] = process.argv
const img = sharp(file)
const { width } = await img.metadata()
const raw = await img.removeAlpha().raw().toBuffer()
const out = []
let run = null
for (let y = +y0; y < +y1; y++) {
  let n = 0
  for (let x = +x0; x < +x1; x++) {
    const i = (y * width + x) * 3
    if (raw[i] < +thr || raw[i + 1] < +thr || raw[i + 2] < +thr) n++
  }
  if (n > 0 && !run) run = [y, y, n]
  else if (n > 0) {
    run[1] = y
    run[2] = Math.max(run[2], n)
  } else if (run) {
    out.push(run)
    run = null
  }
}
if (run) out.push(run)
console.log(
  file.replace(/.*\//, ''),
  `x${x0}-${x1}`,
  out.map(([a, b, n]) => `${a}-${b}(max${n})`).join(' '),
)
