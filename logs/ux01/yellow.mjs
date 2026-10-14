import sharp from 'sharp'
const [, , file, x, from, to] = process.argv
const img = sharp(file)
const { width } = await img.metadata()
const raw = await img.removeAlpha().raw().toBuffer()
const runs = []
let inRun = false
for (let y = +from; y < +to; y++) {
  const i = (y * width + +x) * 3
  const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]]
  const yellow = r > 240 && g > 190 && b < 120
  if (yellow && !inRun) {
    runs.push([y])
    inRun = true
  }
  if (!yellow && inRun) {
    runs[runs.length - 1].push(y)
    inRun = false
  }
}
console.log(file, 'yellow runs at x', x, runs.map((r) => r.join('-')).join(' '))
