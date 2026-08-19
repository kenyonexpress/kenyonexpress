// Downscale refs/live.png and refs/mine.png to a width a reviewer can hold in
// one screen, so a band number can be placed on the page it came from.
//   node scripts/_shot-scale.mjs [width]
import sharp from 'sharp'
const width = Number(process.argv[2] ?? 420)
for (const [side, file] of [
  ['live', 'refs/live.png'],
  ['mine', 'refs/mine.png'],
]) {
  await sharp(file).resize({ width }).toFile(`/tmp/full-${side}.png`)
}
console.log('/tmp/full-live.png /tmp/full-mine.png')
