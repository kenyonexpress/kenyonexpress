import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const publicDir = path.join(projectRoot, 'public', 'images', 'products')
const outputFile = path.join(projectRoot, 'src', 'lib', 'deal-blurs.json')

const BLUR_WIDTH = 16

async function generateBlurData() {
  console.log('Generating blur placeholders for deal images...')

  const blurMap = {}

  // Get all deal images
  const files = await fs.readdir(publicDir)
  const dealFiles = files.filter((f) => f.startsWith('ke-live-deal-') && f.endsWith('.avif'))

  console.log(`Found ${dealFiles.length} deal images`)

  for (const filename of dealFiles.sort()) {
    const imagePath = path.join(publicDir, filename)
    const publicPath = `/images/products/${filename}`

    try {
      // Read the image and generate blur
      const imageBuffer = await fs.readFile(imagePath)
      const blurBuffer = await sharp(imageBuffer)
        .resize({ width: BLUR_WIDTH })
        .webp({ quality: 40 })
        .toBuffer()

      const blurDataURL = `data:image/webp;base64,${blurBuffer.toString('base64')}`
      blurMap[publicPath] = blurDataURL

      console.log(`✓ Generated blur for ${filename}`)
    } catch (err) {
      console.error(`✗ Failed to generate blur for ${filename}:`, err.message)
    }
  }

  // Write the blur data to a JSON file
  await fs.writeFile(outputFile, JSON.stringify(blurMap, null, 2))
  console.log(`\nBlur data saved to ${outputFile}`)
  console.log(`Generated blur placeholders for ${Object.keys(blurMap).length} images`)
}

generateBlurData().catch((err) => {
  console.error('Error generating blur data:', err)
  process.exit(1)
})
