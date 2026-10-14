import sharp from 'sharp'
// best (dx,dy) alignment of a reference box against ours, searching +-R px
const [, , ref, mine, x0, y0, w, h, R = '4'] = process.argv
const load = async (f) => {
  const i = sharp(f)
  const m = await i.metadata()
  return { raw: await i.removeAlpha().raw().toBuffer(), W: m.width }
}
const a = await load(ref)
const b = await load(mine)
const score = (dx, dy) => {
  let d = 0
  for (let y = 0; y < +h; y++)
    for (let x = 0; x < +w; x++) {
      const i = ((+y0 + y) * a.W + (+x0 + x)) * 3
      const j = ((+y0 + y + dy) * b.W + (+x0 + x + dx)) * 3
      if (
        Math.abs(a.raw[i] - b.raw[j]) > 24 ||
        Math.abs(a.raw[i + 1] - b.raw[j + 1]) > 24 ||
        Math.abs(a.raw[i + 2] - b.raw[j + 2]) > 24
      )
        d++
    }
  return +((100 * d) / (+w * +h)).toFixed(1)
}
const out = []
for (let dy = -R; dy <= +R; dy++)
  for (let dx = -R; dx <= +R; dx++) out.push([score(dx, dy), dx, dy])
out.sort((p, q) => p[0] - q[0])
console.log(
  `box x${x0} y${y0} ${w}x${h}: at (0,0) ${score(0, 0)}%; best ${out
    .slice(0, 3)
    .map(([s, dx, dy]) => `${s}% @dx${dx},dy${dy}`)
    .join(' | ')}`,
)
