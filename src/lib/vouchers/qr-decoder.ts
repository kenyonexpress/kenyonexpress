/**
 * One QR decoder for the merchant scanner, two engines behind it.
 *
 * `BarcodeDetector` is the platform's own decoder: hardware-assisted on
 * Android Chrome, no bytes to download, and it takes the <video> element
 * directly. WebKit does not ship it, and the till phones this is for are as
 * likely to be iPhones as not, so the fallback is jsQR, a pure-JS decoder that
 * reads pixels off a canvas. It is loaded only when the native detector is
 * missing and only on this page: nothing on the shop pays for it.
 *
 * Both engines answer the same question - "is there a QR in this frame, and
 * what does it say" - and nothing else. Parsing what it says is
 * lib/vouchers/scan-input.ts, which is why this file has no idea what a
 * voucher is.
 */

export type QrDecoderKind = 'native' | 'jsqr'

export type QrDecoder = {
  kind: QrDecoderKind
  /** The decoded text of the first QR in the frame, or null when there is none. */
  decode(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null>
}

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

export type DecoderWindow = {
  BarcodeDetector?: BarcodeDetectorCtor
}

export type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
) => { data: string } | null

export type JsQrLoader = () => Promise<{ default: JsQrFn }>

export function hasNativeDetector(win: DecoderWindow): boolean {
  return typeof win.BarcodeDetector === 'function'
}

/**
 * jsQR runs on the main thread, so the frame it reads is downscaled to this
 * on its longest side. A voucher QR fills a good part of the viewfinder and
 * decodes comfortably at this size; a full 1080p frame would take longer than
 * the interval between frames on a mid-range phone.
 */
export const JSQR_MAX_EDGE = 640

export function scaledFrameSize(
  videoWidth: number,
  videoHeight: number,
  maxEdge = JSQR_MAX_EDGE,
): { width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0) return { width: 0, height: 0 }
  const longest = Math.max(videoWidth, videoHeight)
  if (longest <= maxEdge) return { width: videoWidth, height: videoHeight }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  }
}

const loadJsQr: JsQrLoader = () => import('jsqr') as Promise<{ default: JsQrFn }>

export async function createQrDecoder(
  win: DecoderWindow,
  load: JsQrLoader = loadJsQr,
): Promise<QrDecoder> {
  const Detector = win.BarcodeDetector
  if (typeof Detector === 'function') {
    const detector = new Detector({ formats: ['qr_code'] })
    return {
      kind: 'native',
      async decode(video) {
        // A frame before the stream has dimensions throws in some builds.
        if (video.readyState < 2) return null
        const found = await detector.detect(video)
        const first = found.find((b) => typeof b.rawValue === 'string' && b.rawValue !== '')
        return first?.rawValue ?? null
      },
    }
  }

  const { default: jsQR } = await load()
  return {
    kind: 'jsqr',
    async decode(video, canvas) {
      if (video.readyState < 2) return null
      const { width, height } = scaledFrameSize(video.videoWidth, video.videoHeight)
      if (width === 0) return null
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      ctx.drawImage(video, 0, 0, width, height)
      const image = ctx.getImageData(0, 0, width, height)
      // A voucher QR is dark on light; skipping the inverted pass halves the
      // work per frame.
      const found = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })
      return found && found.data !== '' ? found.data : null
    },
  }
}
