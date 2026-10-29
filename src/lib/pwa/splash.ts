/**
 * iOS launch-screen table. Files are produced by scripts/generate-pwa-splash.mjs
 * from the same list; each needs an exact device-width/height/ratio media query
 * or iOS ignores it. Next's `appleWebApp.startupImage` renders these as
 * <link rel="apple-touch-startup-image">, set from the (store) layout because
 * the root layout is locked.
 */
export const SPLASH_DEVICES: ReadonlyArray<readonly [number, number, number]> = [
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [375, 667, 2],
  [820, 1180, 2],
  [768, 1024, 2],
]

export const SPLASH_IMAGES = SPLASH_DEVICES.map(([w, h, dpr]) => ({
  url: `/splash/splash-${w * dpr}x${h * dpr}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
}))
