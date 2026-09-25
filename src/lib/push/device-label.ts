/**
 * A user agent string -> the short label the subscription list shows.
 *
 * `push_subscriptions.user_agent` (179) was stored "for a future management
 * UI's device label"; this is that label. It answers a customer's one
 * question when they see a list of browsers: which of these is the phone I
 * lost, and which is the laptop at work. A full UA string does not answer it,
 * and neither does a version number, so both are dropped.
 *
 * Deliberately narrow. The order of the checks matters because every
 * Chromium browser also says "Chrome", every Chrome on iOS also says
 * "Safari", and every iPad since iPadOS 13 claims to be a Mac. Anything the
 * table below does not recognise becomes "דפדפן" rather than a guess.
 */

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bCriOS\//, 'Chrome'],
  [/\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]

const PLATFORMS: [RegExp, string][] = [
  [/\bAndroid\b/, 'Android'],
  [/\biPhone\b|\biPod\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bWindows\b/, 'Windows'],
  [/\bMacintosh\b|\bMac OS X\b/, 'Mac'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
]

const UNKNOWN = 'דפדפן'

export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return UNKNOWN
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? null
  const platform = PLATFORMS.find(([re]) => re.test(userAgent))?.[1] ?? null
  if (browser && platform) return `${browser}, ${platform}`
  return browser ?? platform ?? UNKNOWN
}
