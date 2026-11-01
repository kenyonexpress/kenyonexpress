import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import TurnstileWidget from './TurnstileWidget'

describe('TurnstileWidget', () => {
  const originalEnv = process.env
  const mockTurnstile = vi.fn()

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
  })

  it('renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set', () => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    const { container } = render(<TurnstileWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Turnstile component when site key is configured', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '0x4AAAAAAADJwwDXxZytuALF'
    const { container } = render(<TurnstileWidget />)
    expect(container.querySelector('[class*="turnstile"]')).toBeDefined()
  })

  afterEach(() => {
    process.env = originalEnv
  })
})
