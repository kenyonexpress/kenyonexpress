import { describe, expect, it, vi } from 'vitest'
import { JSQR_MAX_EDGE, createQrDecoder, hasNativeDetector, scaledFrameSize } from './qr-decoder'

/**
 * The decoder chooses its engine by what the browser has, and only the
 * fallback costs a download. Both engines are exercised against fakes: the
 * native one against a scripted BarcodeDetector, jsQR against a canvas whose
 * context returns a known frame.
 */

function video(readyState = 4, w = 1280, h = 720): HTMLVideoElement {
  return { readyState, videoWidth: w, videoHeight: h } as unknown as HTMLVideoElement
}

function canvas(imageData: Uint8ClampedArray = new Uint8ClampedArray(4)) {
  const drawImage = vi.fn()
  const getImageData = vi.fn(() => ({ data: imageData }))
  const c = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage, getImageData })),
  }
  return { element: c as unknown as HTMLCanvasElement, drawImage, getImageData }
}

describe('engine choice', () => {
  it('uses BarcodeDetector when the browser has it and never loads jsQR', async () => {
    const detect = vi.fn(async () => [{ rawValue: '' }, { rawValue: 'KEV1.body.sig' }])
    class BarcodeDetector {
      detect = detect
    }
    const load = vi.fn()
    const decoder = await createQrDecoder({ BarcodeDetector: BarcodeDetector as never }, load)
    expect(decoder.kind).toBe('native')
    expect(load).not.toHaveBeenCalled()
    expect(await decoder.decode(video(), canvas().element)).toBe('KEV1.body.sig')
  })

  it('loads jsQR only when the native detector is missing', async () => {
    const jsQR = vi.fn(() => ({ data: 'ABCDE12345' }))
    const load = vi.fn(async () => ({ default: jsQR }))
    const decoder = await createQrDecoder({}, load)
    expect(decoder.kind).toBe('jsqr')
    expect(load).toHaveBeenCalledTimes(1)
    const c = canvas()
    expect(await decoder.decode(video(), c.element)).toBe('ABCDE12345')
    expect(c.drawImage).toHaveBeenCalled()
    expect(jsQR).toHaveBeenCalledWith(expect.anything(), 640, 360, {
      inversionAttempts: 'dontInvert',
    })
  })

  it('answers null, not a throw, before the stream has a frame', async () => {
    const detect = vi.fn()
    class BarcodeDetector {
      detect = detect
    }
    const native = await createQrDecoder({ BarcodeDetector: BarcodeDetector as never })
    expect(await native.decode(video(0), canvas().element)).toBeNull()
    expect(detect).not.toHaveBeenCalled()

    const jsQR = vi.fn(() => null)
    const fallback = await createQrDecoder({}, async () => ({ default: jsQR }))
    expect(await fallback.decode(video(1), canvas().element)).toBeNull()
    expect(await fallback.decode(video(), canvas().element)).toBeNull()
    expect(jsQR).toHaveBeenCalledTimes(1)
  })

  it('hasNativeDetector reads the window without constructing anything', () => {
    expect(hasNativeDetector({})).toBe(false)
    expect(hasNativeDetector({ BarcodeDetector: class {} as never })).toBe(true)
  })
})

describe('scaledFrameSize', () => {
  it('leaves a small frame alone and scales a large one by its longest edge', () => {
    expect(scaledFrameSize(320, 240)).toEqual({ width: 320, height: 240 })
    expect(scaledFrameSize(1920, 1080)).toEqual({ width: JSQR_MAX_EDGE, height: 360 })
    expect(scaledFrameSize(1080, 1920)).toEqual({ width: 360, height: JSQR_MAX_EDGE })
    expect(scaledFrameSize(0, 0)).toEqual({ width: 0, height: 0 })
  })
})
