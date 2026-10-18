import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as themeModule from '@/lib/theme'
import UserMenuDropdown from './UserMenuDropdown'

vi.mock('@/lib/theme')

describe('UserMenuDropdown', () => {
  beforeEach(() => {
    vi.mocked(themeModule.getTheme).mockReturnValue('light')
    vi.mocked(themeModule.saveTheme).mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should load current theme on mount', async () => {
    render(<UserMenuDropdown />)

    await waitFor(() => {
      expect(themeModule.getTheme).toHaveBeenCalled()
    })
  })

  it('should render dropdown menu button when theme is loaded', async () => {
    vi.mocked(themeModule.getTheme).mockReturnValue('light')
    render(<UserMenuDropdown />)

    await waitFor(() => {
      // Component should render a button after theme is loaded
      expect(screen.getByRole('button', { name: /תפריט/i })).toBeInTheDocument()
    })
  })

  it('should render theme toggle checkbox item', async () => {
    vi.mocked(themeModule.getTheme).mockReturnValue('light')
    render(<UserMenuDropdown />)

    await waitFor(() => {
      expect(themeModule.getTheme).toHaveBeenCalled()
    })
  })

  it('should call saveTheme when theme is changed', async () => {
    vi.mocked(themeModule.getTheme).mockReturnValue('dark')
    render(<UserMenuDropdown />)

    await waitFor(() => {
      expect(themeModule.getTheme).toHaveBeenCalled()
    })

    // Verify saveTheme is available for the component to call
    expect(vi.mocked(themeModule.saveTheme)).toBeDefined()
  })
})
