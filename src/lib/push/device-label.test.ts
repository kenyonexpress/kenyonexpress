import { describe, expect, it } from 'vitest'
import { deviceLabel } from './device-label'

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:129.0) Gecko/20100101 Firefox/129.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
}

describe('deviceLabel', () => {
  it('names the browser and the platform', () => {
    expect(deviceLabel(UA.chromeAndroid)).toBe('Chrome, Android')
    expect(deviceLabel(UA.safariIphone)).toBe('Safari, iPhone')
    expect(deviceLabel(UA.firefoxMac)).toBe('Firefox, Mac')
    expect(deviceLabel(UA.ipad)).toBe('Safari, iPad')
  })

  it('does not call every Chromium browser Chrome, nor Chrome on iOS Safari', () => {
    expect(deviceLabel(UA.edgeWindows)).toBe('Edge, Windows')
    expect(deviceLabel(UA.samsung)).toBe('Samsung Internet, Android')
    expect(deviceLabel(UA.chromeIphone)).toBe('Chrome, iPhone')
  })

  it('never shows the raw string or a version number', () => {
    for (const ua of Object.values(UA)) {
      const label = deviceLabel(ua)
      expect(label).not.toMatch(/\d/)
      expect(label.length).toBeLessThan(30)
    }
  })

  it('answers a neutral word for nothing or for an unknown agent', () => {
    expect(deviceLabel(null)).toBe('דפדפן')
    expect(deviceLabel(undefined)).toBe('דפדפן')
    expect(deviceLabel('')).toBe('דפדפן')
    expect(deviceLabel('curl/8.4.0')).toBe('דפדפן')
  })
})
