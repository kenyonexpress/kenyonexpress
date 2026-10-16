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
})
