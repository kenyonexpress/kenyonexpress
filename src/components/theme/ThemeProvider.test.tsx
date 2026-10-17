import { useTheme } from '@/lib/theme/theme-context'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeProvider'

function TestComponent() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <p>Current theme: {theme}</p>
      <button type="button" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders children', () => {
    render(
      <ThemeProvider>
        <div>Test content</div>
      </ThemeProvider>,
    )
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('provides theme context', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )
    expect(screen.getByText(/Current theme:/)).toBeInTheDocument()
  })

  it('toggles theme and updates localStorage', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )

    const button = screen.getByRole('button', { name: 'Toggle' })

    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Current theme: dark')).toBeInTheDocument()
      expect(localStorage.getItem('ke-theme')).toBe('dark')
    })
  })

  it('sets data-theme attribute on html element', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )

    const button = screen.getByRole('button', { name: 'Toggle' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('adds dark class to html element when in dark mode', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )

    const button = screen.getByRole('button', { name: 'Toggle' })
    fireEvent.click(button)

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('reads initial theme from localStorage', async () => {
    localStorage.setItem('ke-theme', 'dark')

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Current theme: dark')).toBeInTheDocument()
    })
  })
})
