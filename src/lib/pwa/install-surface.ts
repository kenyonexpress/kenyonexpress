/**
 * Which "add to home screen" story a browser can tell, decided from the
 * values the browser exposes and nothing else.
 *
 * Kept as a pure function so the decision is testable without a browser, and
 * so InstallPrompt.tsx stays about rendering. Three answers:
 *
 *   'installed'  already running as an installed app. Offering to install it
 *                is nonsense, and on iOS it would be an instruction to do
 *                something the share sheet no longer offers.
 *   'ios'        Safari on iPhone or iPad, and every other browser on iOS,
 *                because they are all WebKit and none of them fires
 *                `beforeinstallprompt`. There is no API to call: the only
 *                path is the share sheet's "Add to Home Screen", so the offer
 *                has to be instructions.
 *   'prompt'     everything else. Wait for `beforeinstallprompt`; if it never
 *                comes (Firefox, desktop Safari) nothing is shown, which is
 *                right: the browser has said it will not install.
 *
 * The iPad check is the odd one. Since iPadOS 13 Safari reports itself as
 * "Macintosh" so sites serve the desktop layout, and the only tell left is a
 * Mac platform with a touch screen, which no real Mac has.
 */
export type InstallSurface = 'installed' | 'ios' | 'prompt'

export type InstallEnvironment = {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** `matchMedia('(display-mode: standalone)')` or Safari's `navigator.standalone`. */
  standalone: boolean
}

export function detectInstallSurface(env: InstallEnvironment): InstallSurface {
  if (env.standalone) return 'installed'
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return 'ios'
  if (env.platform === 'MacIntel' && env.maxTouchPoints > 1) return 'ios'
  return 'prompt'
}

/** Reads the four inputs off a real window. Split out so the decision above never touches globals. */
export function readInstallEnvironment(win: Window): InstallEnvironment {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent ?? '',
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone:
      win.matchMedia('(display-mode: standalone)').matches === true || nav.standalone === true,
  }
}
