// Crop the same y-band out of refs/live.png and refs/mine.png so a band number
// from compare.mjs can be looked at instead of guessed at.
//   node scripts/_band-crop.mjs <top> <height> <name>
import sharp from 'sharp'
const [top, height, name] = process.argv.slice(2)
if (!name) {
  console.error('usage: node scripts/_band-crop.mjs <top> <height> <name>')
  process.exit(2)
}
for (const [side, file] of [
  ['live', 'refs/live.png'],
  ['mine', 'refs/mine.png'],
]) {
  const meta = await sharp(file).metadata()
  const t = Math.min(Number(top), Math.max(0, meta.height - Number(height)))
  await sharp(file)
    .extract({ left: 0, top: t, width: meta.width, height: Number(height) })
    .resize({ width: 900 })
    .toFile(`/tmp/${name}-${side}.png`)
}
console.log(`/tmp/${name}-live.png /tmp/${name}-mine.png`)
