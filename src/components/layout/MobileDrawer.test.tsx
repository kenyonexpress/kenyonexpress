import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MobileDrawer from './MobileDrawer'

describe('MobileDrawer', () => {
  it('renders hamburger button', () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })
    expect(button).toBeInTheDocument()
  })

  it('opens drawer when hamburger button is clicked', async () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(button)
    await waitFor(() => {
      const drawer = screen.getByRole('dialog')
      expect(drawer).toBeInTheDocument()
    })
  })

  it('closes drawer when close button is clicked', async () => {
    render(<MobileDrawer />)
    const hamburger = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(hamburger)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Two controls carry this name while the drawer is open: the scrim and the
    // panel's own close button. Scope to the panel so the test exercises the
    // visible control and does not pass by hitting the scrim.
    const closeButton = within(screen.getByRole('dialog')).getByRole('button', {
      name: /סגירת התפריט/,
    })
    fireEvent.click(closeButton)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('closes drawer when escape key is pressed', async () => {
    render(<MobileDrawer />)
    const hamburger = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(hamburger)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('anchors the panel at the inline START so the closed translate leaves the viewport', async () => {
    // `end-0` under dir="rtl" is the LEFT edge; with `translate-x-full` the
    // closed panel then slid RIGHT into the page and was probed at x350 w350
    // on a 768 viewport (2026-10-20). Live's closed panel is past the right
    // edge, which is start-0 + translate-x-full in RTL.
    render(<MobileDrawer />)
    fireEvent.click(screen.getByRole('button', { name: /תפריט קטגוריות/ }))
    await waitFor(() => {
      const drawer = screen.getByRole('dialog')
      expect(drawer).toHaveClass('start-0')
      expect(drawer).not.toHaveClass('end-0')
    })
  })

  it('applies slide-in animation to drawer panel', async () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(button)
    await waitFor(() => {
      const drawer = screen.getByRole('dialog')
      expect(drawer).toHaveClass('transition-transform', 'duration-300')
    })
  })

  it('applies fade-in animation to drawer header', async () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(button)
    await waitFor(() => {
      const header = screen.getByText(/תפריט קטגוריות/)
      const headerContainer = header.closest('div')
      expect(headerContainer).toHaveClass('animate-in', 'fade-in', 'slide-in-from-top')
    })
  })

  it('has motion-reduce class for accessibility', async () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(button)
    await waitFor(() => {
      const drawer = screen.getByRole('dialog')
      expect(drawer).toHaveClass('motion-reduce:transition-none')
    })
  })

  it('hamburger button has smooth transition classes', () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    expect(button).toHaveClass('transition-all', 'duration-200')
  })

  it('applies active scale state to buttons', () => {
    render(<MobileDrawer />)
    const hamburger = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    expect(hamburger).toHaveClass('active:scale-95')
  })

  it('renders category links with proper structure', async () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(button)
    await waitFor(() => {
      const nav = screen.getByRole('navigation', { name: /תפריט קטגוריות/ })
      expect(nav).toBeInTheDocument()

      const links = nav.querySelectorAll('a')
      expect(links.length).toBeGreaterThan(0)
    })
  })

  it('applies staggered animations to category items', async () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(button)
    await waitFor(() => {
      const nav = screen.getByRole('navigation', { name: /תפריט קטגוריות/ })
      const listItems = nav.querySelectorAll('li')
      expect(listItems.length).toBeGreaterThan(0)
      for (const item of listItems) {
        expect(item).toHaveClass('animate-in', 'fade-in', 'slide-in-from-right-4')
      }
    })
  })

  it('closes drawer when category link is clicked', async () => {
    render(<MobileDrawer />)
    const hamburger = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(hamburger)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    const categoryLinks = screen.getAllByRole('link')
    if (categoryLinks.length > 0 && categoryLinks[0]) {
      fireEvent.click(categoryLinks[0] as HTMLElement)
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    }
  })

  it('applies scrim animation overlay', async () => {
    render(<MobileDrawer />)
    const button = screen.getByRole('button', { name: /תפריט קטגוריות/ })

    fireEvent.click(button)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const scrimButton = buttons.find(
        (btn) => btn.getAttribute('aria-label') === 'סגירת התפריט' && btn !== button,
      )
      expect(scrimButton).toHaveClass('transition-opacity', 'duration-300')
    })
  })
})
