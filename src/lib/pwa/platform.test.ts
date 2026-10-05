import { describe, expect, it } from 'vitest'
import { isInstalled, isIos, wantsIosInstallHint } from './platform'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'

describe('isIos', () => {
  it('reads an iPhone off the user agent', () => {
    expect(isIos({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(true)
  })

  it('catches an iPad that calls itself a Mac, by its touch points', () => {
    expect(isIos({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })

  it('leaves a real Mac alone: same user agent, zero touch points', () => {
    expect(isIos({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })

  it('is false on Android, which has beforeinstallprompt and needs no hint', () => {
    expect(isIos({ userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
  })
})

describe('isInstalled', () => {
  it('trusts either flag', () => {
    expect(isInstalled({ standalone: true, displayModeStandalone: false })).toBe(true)
    expect(isInstalled({ standalone: undefined, displayModeStandalone: true })).toBe(true)
    expect(isInstalled({ standalone: false, displayModeStandalone: false })).toBe(false)
  })
})

describe('wantsIosInstallHint', () => {
  const tab = {
    userAgent: IPHONE,
    platform: 'iPhone',
    maxTouchPoints: 5,
    standalone: false,
    displayModeStandalone: false,
  }

  it('is the iPhone in a browser tab', () => {
    expect(wantsIosInstallHint(tab)).toBe(true)
  })

  it('never inside the installed app: that is the one place the hint is wrong', () => {
    expect(wantsIosInstallHint({ ...tab, standalone: true })).toBe(false)
    expect(wantsIosInstallHint({ ...tab, displayModeStandalone: true })).toBe(false)
  })

  it('never on Android', () => {
    expect(wantsIosInstallHint({ ...tab, userAgent: ANDROID, platform: 'Linux armv8l' })).toBe(
      false,
    )
  })
})
