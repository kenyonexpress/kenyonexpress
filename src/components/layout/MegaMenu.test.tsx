import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MegaMenu from './MegaMenu'

describe('MegaMenu', () => {
  it('renders navigation with category items', () => {
    render(<MegaMenu />)
    expect(screen.getByRole('navigation', { name: /תפריט קטגוריות ראשי/ })).toBeInTheDocument()
  })

  it('displays category buttons', () => {
    render(<MegaMenu />)
    expect(screen.getByRole('button', { name: /דילים חמים/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /עד ₪99/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /החדשים/ })).toBeInTheDocument()
  })

  it('opens mega menu panel on button click', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
  })

  it('closes mega menu panel when button is clicked again', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('closes mega menu when escape key is pressed', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    fireEvent.keyDown(button, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  it('navigates between categories with arrow keys', async () => {
    render(<MegaMenu />)
    const firstButton = screen.getByRole('button', { name: /דילים חמים/ })
    const secondButton = screen.getByRole('button', { name: /עד ₪99/ })

    fireEvent.click(firstButton)
    await waitFor(() => {
      expect(firstButton).toHaveAttribute('aria-expanded', 'true')
    })

    fireEvent.keyDown(firstButton, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(secondButton).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('displays promo text when menu is open', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    fireEvent.click(button)
    await waitFor(() => {
      expect(screen.getByText(/עד 50% הנחה/)).toBeInTheDocument()
    })
  })

  it('displays subcategories when available', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /מסעדות ובתי קפה/ })

    // Click to open menu (faster than hover delay)
    fireEvent.click(button)
    const menu = await screen.findByRole('menu', {}, { timeout: 200 })

    // Check that menu is open and contains subcategories
    expect(menu).toBeInTheDocument()
    const menuText = menu.textContent || ''
    expect(menuText).toContain('כל המסעדות')
    expect(menuText).toContain('בתי קפה')
  })

  it('has proper ARIA attributes', () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-haspopup', 'true')
  })

  it('applies smooth transition animations to menu panel', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    fireEvent.click(button)
    await waitFor(() => {
      const panel = screen.getByRole('menu')
      expect(panel).toHaveClass('animate-in', 'fade-in', 'slide-in-from-top-2', 'duration-300')
    })
  })

  it('applies motion-reduce class for accessibility', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    fireEvent.click(button)
    await waitFor(() => {
      const panel = screen.getByRole('menu')
      expect(panel).toHaveClass('motion-reduce:animate-none')
    })
  })

  it('applies smooth transitions to button hover states', () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    expect(button).toHaveClass('transition-all', 'duration-200')
  })

  it('applies animations to subcategories on menu open', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /מסעדות ובתי קפה/ })

    fireEvent.click(button)
    const menu = await screen.findByRole('menu', {}, { timeout: 200 })
    const subcategoryList = menu.querySelector('ul')

    expect(subcategoryList).toHaveClass(
      'animate-in',
      'fade-in',
      'slide-in-from-left-2',
      'duration-300',
    )
  })

  it('applies animations to promo banner', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    fireEvent.click(button)
    const panel = await screen.findByRole('menu')
    const promoBanner = panel.querySelector('[role="complementary"]')

    expect(promoBanner).toHaveClass(
      'animate-in',
      'fade-in',
      'slide-in-from-right-2',
      'duration-300',
    )
  })

  it('button shows active state styling when menu is open', async () => {
    render(<MegaMenu />)
    const button = screen.getByRole('button', { name: /דילים חמים/ })

    fireEvent.click(button)
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-expanded', 'true')
      expect(button).toHaveClass('bg-[color:var(--electro-surface-hover)]', 'shadow-sm')
    })
  })
})
