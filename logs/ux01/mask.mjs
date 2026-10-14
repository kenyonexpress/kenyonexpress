import sharp from 'sharp'
const w = +process.argv[2]
const H = 2600
const live = await sharp(`refs/ke_live_${w}.png`)
  .extract({ left: 0, top: 0, width: w, height: H })
  .removeAlpha()
  .raw()
  .toBuffer()
const mine = await sharp(`/tmp/ux01-mine-${w}.png`)
  .extract({ left: 0, top: 0, width: w, height: H })
  .removeAlpha()
  .raw()
  .toBuffer()
const out = Buffer.alloc(w * H * 3, 255)
const TOL = 24
const BLANK = 247
const bands = []
let both = 0
for (let y0 = 0; y0 < H; y0 += 100) {
  let b = 0
  for (let y = y0; y < Math.min(y0 + 100, H); y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const d =
        Math.abs(live[i] - mine[i]) > TOL ||
        Math.abs(live[i + 1] - mine[i + 1]) > TOL ||
        Math.abs(live[i + 2] - mine[i + 2]) > TOL
      if (!d) continue
      const lb = live[i] > BLANK && live[i + 1] > BLANK && live[i + 2] > BLANK
      const mb = mine[i] > BLANK && mine[i + 1] > BLANK && mine[i + 2] > BLANK
      if (lb) {
        out[i] = 200
        out[i + 1] = 200
        out[i + 2] = 255
      } // ref blank: light blue
      else if (mb) {
        out[i] = 255
        out[i + 1] = 220
        out[i + 2] = 200
      } // ours blank: light orange
      else {
        out[i] = 255
        out[i + 1] = 0
        out[i + 2] = 0
        b++
        both++
      }
    }
  bands.push([y0, ((100 * b) / (100 * w)).toFixed(2)])
}
console.log('bothPainted', ((100 * both) / (w * H)).toFixed(2))
console.log(bands.map(([y, p]) => `${y}:${p}`).join(' '))
await sharp(out, { raw: { width: w, height: H, channels: 3 } })
  .png()
  .toFile(`/tmp/ux01-mask-${w}.png`)
