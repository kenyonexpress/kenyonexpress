/**
 * Where the page is running, for the two decisions that depend on it:
 * whether to show the Chrome-style install banner or the iOS "share, then add
 * to home screen" hint, and whether web push can work at all here.
 *
 * iOS NEVER FIRES `beforeinstallprompt`. Safari on iPhone and iPad has no
 * install event and no API to trigger one; the only way onto the home screen
 * is the share sheet, and the only thing a site can do is say so. Since
 * iOS 16.4 the same is true of every other browser on iOS, which all wrap
 * WebKit and all put "Add to Home Screen" in their own share menu, so the
 * hint names the share button and not Safari.
 *
 * WEB PUSH ON iOS ONLY WORKS FROM THE HOME SCREEN. A Safari tab has no
 * `PushManager`; the installed web app does. So `PushOptIn`'s "unsupported"
 * state on an iPhone is not a dead end, it is the same hint with a different
 * reason attached, and this module is what lets it tell the two apart.
 *
 * `navigator.standalone` is the iOS-only flag; `display-mode: standalone` is
 * the standard one and is also true for an installed iOS web app on recent
 * versions. Both are read, because a hint to install shown INSIDE the
 * installed app is the one message guaranteed to be wrong.
 *
 * iPadOS 13+ reports a desktop Safari user agent ("Macintosh") on purpose,
 * so the touch-point check is what catches an iPad; a real Mac has zero.
 *
 * Pure functions over explicit inputs, so the tests do not have to rewrite
 * `navigator`.
 */

export interface PlatformInput {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** `navigator.standalone`, iOS only; absent elsewhere. */
  standalone: boolean | undefined
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayModeStandalone: boolean
}

export function isIos(
  input: Pick<PlatformInput, 'userAgent' | 'platform' | 'maxTouchPoints'>,
): boolean {
  if (/iPhone|iPad|iPod/i.test(input.userAgent)) return true
  return input.platform === 'MacIntel' && input.maxTouchPoints > 1
}

export function isInstalled(
  input: Pick<PlatformInput, 'standalone' | 'displayModeStandalone'>,
): boolean {
  return input.standalone === true || input.displayModeStandalone
}

/** An iPhone or iPad, in a browser tab rather than the installed app. */
export function wantsIosInstallHint(input: PlatformInput): boolean {
  return isIos(input) && !isInstalled(input)
}

/** Reads the inputs off the live browser; `null` when there is no window. */
export function readPlatform(): PlatformInput | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent ?? '',
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone,
    displayModeStandalone:
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false,
  }
}
