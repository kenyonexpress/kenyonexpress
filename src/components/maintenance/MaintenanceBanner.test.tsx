import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MaintenanceBanner from './MaintenanceBanner'

describe('MaintenanceBanner', () => {
  it('renders nothing when the flag is off', () => {
    expect(renderToStaticMarkup(<MaintenanceBanner env={{}} />)).toBe('')
  })
  it('renders when the flag is on', () => {
    const html = renderToStaticMarkup(<MaintenanceBanner env={{ FLAG_MAINTENANCE_BANNER: '1' }} />)
    expect(html).toContain('data-maintenance-banner')
  })
})
