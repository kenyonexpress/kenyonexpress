import { describe, expect, it } from 'vitest'
import { detectInstallSurface, readInstallEnvironment } from './install-surface'

/**
 * The only way an iPhone visitor is ever offered the app.
 *
 * Safari on iOS has never fired `beforeinstallprompt`, and every other iOS
 * browser is WebKit under the hood and does not either. Before this module the
 * install banner rendered off that event alone, so on the platform that is
 * most of the mobile traffic in Israel it rendered for nobody, and the
 * `apple-touch-icon` and `appleWebApp` metadata in the root layout were
 * describing an install nobody was told how to perform.
 */

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'

const base = { platform: '', maxTouchPoints: 0, standalone: false }

describe('detectInstallSurface', () => {
  it('sends an iPhone to the share-sheet instructions, in every iOS browser', () => {
    expect(detectInstallSurface({ ...base, userAgent: IPHONE_SAFARI, platform: 'iPhone' })).toBe(
      'ios',
    )
    // Chrome on iOS is WebKit and fires no prompt event either.
    expect(detectInstallSurface({ ...base, userAgent: IPHONE_CHROME, platform: 'iPhone' })).toBe(
      'ios',
    )
  })

  it('recognises an iPad pretending to be a Mac by its touch screen', () => {
    expect(
      detectInstallSurface({
        ...base,
        userAgent: IPAD_DESKTOP_MODE,
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe('ios')
  })

  it('leaves a real Mac to the prompt event, which desktop Safari never sends', () => {
    // No touch points: an actual Macintosh. Nothing is shown there, and that
    // is correct rather than a gap.
    expect(
      detectInstallSurface({
        ...base,
        userAgent: IPAD_DESKTOP_MODE,
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe('prompt')
  })

  it('leaves Android to beforeinstallprompt', () => {
    expect(
      detectInstallSurface({ ...base, userAgent: ANDROID_CHROME, platform: 'Linux armv8l' }),
    ).toBe('prompt')
  })

  it('offers nothing to an app that is already installed, on either platform', () => {
    expect(
      detectInstallSurface({
        ...base,
        userAgent: IPHONE_SAFARI,
        platform: 'iPhone',
        standalone: true,
      }),
    ).toBe('installed')
    expect(detectInstallSurface({ ...base, userAgent: ANDROID_CHROME, standalone: true })).toBe(
      'installed',
    )
  })
})

describe('readInstallEnvironment', () => {
  it("treats Safari's navigator.standalone as installed, not only the media query", () => {
    // iOS exposes the installed state on navigator, and the media query is
    // also true there; a home-screen app on an older iOS reports only the
    // former. Either one has to be enough.
    const win = {
      navigator: {
        userAgent: IPHONE_SAFARI,
        platform: 'iPhone',
        maxTouchPoints: 5,
        standalone: true,
      },
      matchMedia: () => ({ matches: false }),
    } as unknown as Window

    expect(readInstallEnvironment(win).standalone).toBe(true)
    expect(detectInstallSurface(readInstallEnvironment(win))).toBe('installed')
  })

  it('copes with a navigator missing the newer fields', () => {
    const win = {
      navigator: { userAgent: ANDROID_CHROME },
      matchMedia: () => ({ matches: false }),
    } as unknown as Window

    expect(readInstallEnvironment(win)).toEqual({
      userAgent: ANDROID_CHROME,
      platform: '',
      maxTouchPoints: 0,
      standalone: false,
    })
  })
})
