import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('ke-theme', 'light')
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders light mode button by default', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAccessibleName('עבור למצב כהה')
  })

  it('toggles theme on click', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    const button = screen.getByRole('button')

    fireEvent.click(button)
    await waitFor(() => {
      expect(button).toHaveAccessibleName('עבור למצב בהיר')
    })
  })

  it('shows Hebrew text for theme toggle', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(screen.getByText('כהה')).toBeInTheDocument()
  })
})
