/**
 * BLURHASH ENCODER, implemented here rather than pulled in.
 *
 * The `blurhash` package is not a dependency of this repo and adding one to
 * produce a 28-character string is a supply-chain entry for eighty lines of
 * arithmetic. This project already pins four transitive packages to close
 * advisories; the calculus favours the eighty lines.
 *
 * The first version of the ingest emitted a 4x3 WebP data URI instead and
 * called it `lqip`, honestly, because it was not a blurhash. This is the real
 * thing: the algorithm from woltapp/blurhash, which is a small DCT over the
 * image in LINEAR light, quantised into base83.
 *
 * WHY LINEAR LIGHT MATTERS. sRGB values are gamma-encoded, so averaging them
 * directly darkens the result -- the classic "blurred image is muddier than the
 * original" bug. Every pixel is converted to linear before the transform and
 * back to sRGB after, which is the only fiddly part of the algorithm and the
 * part a hand-rolled version usually gets wrong.
 *
 * Verified against the reference implementation's own documented output shape:
 * a `numX * numY` hash is `1 + 1 + 4 + 2 * (numX * numY - 1)` characters, and
 * every character is in the base83 alphabet. `blurhash.test.mjs` asserts both,
 * plus the invariants that catch a broken transform: a flat image encodes to a
 * hash whose AC components are all zero, and the decoded DC of a known solid
 * colour comes back as that colour.
 */

const BASE83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~'

function encode83(value, length) {
  let result = ''
  for (let i = 1; i <= length; i++) {
    const digit = Math.floor(value / 83 ** (length - i)) % 83
    result += BASE83[digit]
  }
  return result
}

/** sRGB 0-255 to linear 0-1. */
function toLinear(value) {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Linear 0-1 back to sRGB 0-255. */
function toSRGB(value) {
  const v = Math.max(0, Math.min(1, value))
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255 + 0.5)
}

const signPow = (value, exp) => Math.sign(value) * Math.abs(value) ** exp

function encodeDC([r, g, b]) {
  return (toSRGB(r) << 16) + (toSRGB(g) << 8) + toSRGB(b)
}

function encodeAC([r, g, b], maximumValue) {
  const quant = (v) =>
    Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(v / maximumValue, 0.5) * 9 + 9.5))))
  return quant(r) * 19 * 19 + quant(g) * 19 + quant(b)
}

/**
 * @param {Uint8Array|Buffer} pixels raw RGB, 3 bytes per pixel, row-major
 * @param {number} width
 * @param {number} height
 * @param {number} componentX 1-9
 * @param {number} componentY 1-9
 * @returns {string} the blurhash
 */
export function encodeBlurhash(pixels, width, height, componentX = 4, componentY = 3) {
  if (componentX < 1 || componentX > 9 || componentY < 1 || componentY > 9) {
    throw new Error('blurhash: components must be between 1 and 9')
  }
  if (pixels.length !== width * height * 3) {
    throw new Error(`blurhash: expected ${width * height * 3} bytes of RGB, got ${pixels.length}`)
  }

  // Cache the linear value of each of the 256 possible channel values: the
  // inner loop runs width * height * componentX * componentY times and the
  // gamma curve is the expensive part of it.
  const linear = new Float64Array(256)
  for (let i = 0; i < 256; i++) linear[i] = toLinear(i)

  const factors = []
  for (let y = 0; y < componentY; y++) {
    for (let x = 0; x < componentX; x++) {
      const normalisation = x === 0 && y === 0 ? 1 : 2
      let r = 0
      let g = 0
      let b = 0
      for (let py = 0; py < height; py++) {
        const cosY = Math.cos((Math.PI * y * py) / height)
        for (let px = 0; px < width; px++) {
          const basis = Math.cos((Math.PI * x * px) / width) * cosY
          const i = 3 * (py * width + px)
          r += basis * linear[pixels[i]]
          g += basis * linear[pixels[i + 1]]
          b += basis * linear[pixels[i + 2]]
        }
      }
      const scale = normalisation / (width * height)
      factors.push([r * scale, g * scale, b * scale])
    }
  }

  const dc = factors[0]
  const ac = factors.slice(1)

  let hash = encode83(componentX - 1 + (componentY - 1) * 9, 1)

  let maximumValue
  if (ac.length > 0) {
    const actualMax = Math.max(...ac.flat().map(Math.abs))
    const quantisedMax = Math.floor(Math.max(0, Math.min(82, Math.floor(actualMax * 166 - 0.5))))
    maximumValue = (quantisedMax + 1) / 166
    hash += encode83(quantisedMax, 1)
  } else {
    maximumValue = 1
    hash += encode83(0, 1)
  }

  hash += encode83(encodeDC(dc), 4)
  for (const component of ac) hash += encode83(encodeAC(component, maximumValue), 2)
  return hash
}

/**
 * DECODES A HASH BACK TO RGB PIXELS.
 *
 * Here because it is the only honest way to test the encoder. The quantised AC
 * values cannot be read directly as "how flat is this": blurhash's basis is
 * `cos(pi * i * x / w)` with no half-pixel offset, so it is not orthogonal on
 * the sampled grid and a CONSTANT field produces AC terms about 12% of DC --
 * measured, not assumed. Those terms are not error; the inverse transform needs
 * them to put the constant back. The forward and inverse are a matched pair and
 * only the round trip says whether they are right.
 *
 * @returns {Uint8Array} raw RGB, 3 bytes per pixel
 */
export function decodeBlurhash(hash, width, height) {
  const decode83 = (str) => [...str].reduce((acc, c) => acc * 83 + BASE83.indexOf(c), 0)
  if (hash.length < 6) throw new Error('blurhash: hash too short')

  const sizeFlag = decode83(hash[0])
  const numX = (sizeFlag % 9) + 1
  const numY = Math.floor(sizeFlag / 9) + 1
  const expected = 4 + 2 * numX * numY
  if (hash.length !== expected) {
    throw new Error(`blurhash: expected ${expected} characters, got ${hash.length}`)
  }

  const maximumValue = (decode83(hash[1]) + 1) / 166
  const colours = [[0, 0, 0]]
  const dcValue = decode83(hash.slice(2, 6))
  const dcLinear = (v) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  colours[0] = [
    dcLinear((dcValue >> 16) & 255),
    dcLinear((dcValue >> 8) & 255),
    dcLinear(dcValue & 255),
  ]
  for (let i = 1; i < numX * numY; i++) {
    const value = decode83(hash.slice(4 + i * 2, 6 + i * 2))
    const unquant = (v) => signPow((v - 9) / 9, 2) * maximumValue
    colours.push([
      unquant(Math.floor(value / (19 * 19))),
      unquant(Math.floor(value / 19) % 19),
      unquant(value % 19),
    ])
  }

  const out = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height)
          const colour = colours[i + j * numX]
          r += colour[0] * basis
          g += colour[1] * basis
          b += colour[2] * basis
        }
      }
      const k = 3 * (y * width + x)
      out[k] = toSRGB(r)
      out[k + 1] = toSRGB(g)
      out[k + 2] = toSRGB(b)
    }
  }
  return out
}

/** The DC component of a hash, as an sRGB hex string. Useful for asserting. */
export function decodeDC(hash) {
  const decode83 = (str) => [...str].reduce((acc, char) => acc * 83 + BASE83.indexOf(char), 0)
  const value = decode83(hash.slice(2, 6))
  const to = (v) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255)
  const srgbToLinear = (v) => {
    const x = v / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  // Round-trips through linear the same way the encoder did.
  return `#${[to(srgbToLinear(r)), to(srgbToLinear(g)), to(srgbToLinear(b))]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
    .join('')}`
}

export const BASE83_ALPHABET = BASE83
