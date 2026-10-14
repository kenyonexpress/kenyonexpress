import sharp from 'sharp'
const [, , file, y, x0, x1, thr = '240'] = process.argv
const img = sharp(file)
const { width } = await img.metadata()
const raw = await img.removeAlpha().raw().toBuffer()
const runs = []
let run = null
for (let x = +x0; x < +x1; x++) {
  const i = (+y * width + x) * 3
  const dark = raw[i] < +thr || raw[i + 1] < +thr || raw[i + 2] < +thr
  if (dark && !run) run = [x, x]
  else if (dark) run[1] = x
  else if (run) {
    runs.push(run)
    run = null
  }
}
if (run) runs.push(run)
console.log(file.replace(/.*\//, ''), `y${y}`, runs.map(([a, b]) => `${a}-${b}`).join(' '))
