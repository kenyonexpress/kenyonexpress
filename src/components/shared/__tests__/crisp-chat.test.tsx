import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CrispChat from '../CrispChat'

describe('CrispChat', () => {
  const originalEnv = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID

  beforeEach(() => {
    window.$crisp = undefined
    window.CRISP_WEBSITE_ID = undefined
    // Remove any existing Crisp scripts
    for (const s of document.querySelectorAll('script[src*="crisp"]')) {
      s.remove()
    }
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID = originalEnv
    vi.restoreAllMocks()
  })

  it('does not load when NEXT_PUBLIC_CRISP_WEBSITE_ID is not set', () => {
    process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID = ''
    render(<CrispChat />)

    const scripts = document.querySelectorAll('script[src*="crisp"]')
    expect(scripts.length).toBe(0)
  })

  it('loads Crisp script when website ID is configured', () => {
    process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID = 'test-website-id'
    render(<CrispChat />)

    const script = document.querySelector(
      'script[src="https://client.crisp.chat/l.js"]',
    ) as HTMLScriptElement
    expect(script).toBeTruthy()
    expect(script?.async).toBe(true)
    expect(window.CRISP_WEBSITE_ID).toBe('test-website-id')
  })

  it('initializes $crisp array', () => {
    process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID = 'test-id'
    render(<CrispChat />)

    expect(window.$crisp).toBeInstanceOf(Array)
  })

  it('configures Hebrew locale on script load', () => {
    process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID = 'test-id'

    render(<CrispChat />)

    // Spy on the $crisp array that was created during render
    const pushSpy = vi.spyOn(window.$crisp!, 'push')

    const script = document.querySelector('script[src*="crisp"]') as HTMLScriptElement
    script?.onload?.(new Event('load'))

    expect(pushSpy).toHaveBeenCalledWith(['set', 'session:data', [[['locale', 'he']]]])
  })

  it('renders no visible component', () => {
    process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID = 'test-id'
    const { container } = render(<CrispChat />)

    expect(container.firstChild).toBeNull()
  })
})
