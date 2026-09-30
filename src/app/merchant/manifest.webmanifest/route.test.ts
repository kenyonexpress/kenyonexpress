import { describe, expect, it } from 'vitest'
import { GET as siteGET } from '../../manifest.webmanifest/route'
import { GET } from './route'

/**
 * Two manifests, one origin. What matters is that the till's launches at the
 * viewfinder and owns only /merchant/, that the shop's still launches at the
 * home page under the URL it always had, and that both name the same icons so
 * e2e/pwa.spec.ts's "every icon loads" sweep covers both.
 */
describe('/merchant/manifest.webmanifest', () => {
  it('starts at the scanner and is scoped to /merchant/', async () => {
    const res = GET()
    expect(res.headers.get('content-type')).toContain('manifest')
    const body = await res.json()
    expect(body.start_url).toBe('/merchant/scan')
    expect(body.scope).toBe('/merchant/')
    expect(body.display).toBe('standalone')
    expect(body.dir).toBe('rtl')
    expect(body.lang).toBe('he')
  })

  it('names the same icons as the shop, so the sweep that checks them covers both', async () => {
    const till = await GET().json()
    const shop = await siteGET().json()
    expect(till.icons.map((i: { src: string }) => i.src)).toEqual(
      shop.icons.map((i: { src: string }) => i.src),
    )
    expect(till.theme_color).toBe(shop.theme_color)
  })

  it('the shop manifest kept its URL and its start page', async () => {
    const res = siteGET()
    expect(res.headers.get('content-type')).toContain('manifest')
    const body = await res.json()
    expect(body.start_url).toBe('/')
    expect(body.name).toBe('קניון אקספרס')
  })
})
