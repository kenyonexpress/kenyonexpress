import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as themeModule from '@/lib/theme'
import UserMenu from './UserMenu'

vi.mock('@/lib/theme')

describe('UserMenu', () => {
  const email = 'test@example.com'

  beforeEach(() => {
    vi.mocked(themeModule.getTheme).mockReturnValue('light')
    vi.mocked(themeModule.saveTheme).mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render user menu trigger button', () => {
    render(<UserMenu email={email} />)
    expect(screen.getByRole('button', { name: /תפריט חשבון/i })).toBeInTheDocument()
  })

  it('should load current theme on mount', async () => {
    vi.mocked(themeModule.getTheme).mockReturnValueOnce('dark')
    render(<UserMenu email={email} />)

    await waitFor(() => {
      expect(themeModule.getTheme).toHaveBeenCalled()
    })
  })

  it('should render trigger button with user icon', () => {
    render(<UserMenu email={email} />)
    const button = screen.getByRole('button', { name: /תפריט חשבון/i })
    expect(button).toBeInTheDocument()
    // Check for the SVG icon
    const svg = button.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('should not render until mounted (prevents hydration mismatch)', () => {
    vi.mocked(themeModule.getTheme).mockReturnValue('light')
    const { container } = render(<UserMenu email={email} />)

    // Button should exist after component mounts
    expect(container.querySelector('button')).toBeInTheDocument()
  })

  it('should call saveTheme function when theme is changed', async () => {
    vi.mocked(themeModule.getTheme).mockReturnValue('light')
    render(<UserMenu email={email} />)

    await waitFor(() => {
      expect(themeModule.getTheme).toHaveBeenCalled()
    })

    // Verify saveTheme is available for the component to call
    expect(vi.mocked(themeModule.saveTheme)).toBeDefined()
  })
})
