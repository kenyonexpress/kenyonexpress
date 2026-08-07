#!/usr/bin/env node
/**
 * Extracts the still frame that the hero slider serves below the desktop
 * breakpoint, so the 777KB animated WebP never reaches a phone.
 *
 * Why frame 0 and not any other: the animation runs an iPhone through a setup
 * sequence and ENDS on a black screen (frame 46 is the display switched off).
 * Frame 0 is the full iOS home screen, which is both the richest frame and the
 * one the animation already paints first, so the mobile still and the desktop
 * animation are identical at t=0 and the design does not fork.
 *
 * The output is a SOURCE file, not what ships over the wire: it is a still, so
 * next/image resizes it per `sizes` and the browser gets a fraction of it. That
 * is the entire point of the change - the animated original is `unoptimized`
 * and could never be resized without killing the animation.
 *
 * Re-run: node scripts/hero-still-frame.mjs
 */
import { stat } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const SRC = 'public/images/hero/slider/ios13-iphone-11pro-airpods-pro-setup-animation-steps.webp'
const OUT = 'public/images/hero/slider/ios13-iphone-11pro-airpods-pro-setup-animation-still.webp'
const FRAME = 0
/** Source quality, not delivery quality. next/image re-encodes at its own. */
const QUALITY = 95

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`

const meta = await sharp(SRC, { animated: true }).metadata()
if (FRAME >= meta.pages) throw new Error(`frame ${FRAME} of ${meta.pages}`)

await sharp(SRC, { pages: 1, page: FRAME }).webp({ quality: QUALITY, effort: 6 }).toFile(OUT)

const [before, after] = await Promise.all([stat(SRC), stat(OUT)])
console.log(`${SRC}\n  ${meta.width}x${meta.pageHeight}, ${meta.pages} frames, ${kb(before.size)}`)
console.log(`${OUT}\n  frame ${FRAME}, ${kb(after.size)}`)
