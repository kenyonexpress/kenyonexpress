import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SiteFooter from './SiteFooter'

// Mock CopyrightYear component
vi.mock('./CopyrightYear', () => ({
  default: () => <span>2026</span>,
}))

describe('SiteFooter', () => {
  it('renders footer element', () => {
    render(<SiteFooter />)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('renders all section headings on desktop', () => {
    const { container } = render(<SiteFooter />)
    const desktopSection = container.querySelector('.hidden.md\\:block')
    expect(desktopSection?.textContent).toContain('אודות')
    expect(desktopSection?.textContent).toContain('שירות לקוחות')
    expect(desktopSection?.textContent).toContain('משפטי')
  })

  it('renders all links in desktop footer', () => {
    render(<SiteFooter />)
    expect(screen.getByRole('link', { name: 'מי אנחנו' })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: 'צור קשר' })).toHaveAttribute('href', '/contact')
    expect(screen.getByRole('link', { name: 'תנאי שימוש' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'מדיניות פרטיות' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'מדיניות החזרות' })).toHaveAttribute(
      'href',
      '/refund_returns',
    )
  })

  it('renders copyright year', () => {
    render(<SiteFooter />)
    const copyrightTexts = screen.getAllByText('2026')
    expect(copyrightTexts.length).toBeGreaterThan(0)
    expect(screen.getAllByText(/קניון EXPRESS/).length).toBeGreaterThan(0)
  })

  it('prints the business registration number on the legal line, desktop and mobile', () => {
    render(<SiteFooter />)
    const lines = screen.getAllByText(/מספר עוסק 033798513/)
    expect(lines.length).toBe(2)
    for (const line of lines) {
      expect(line.textContent).toMatch(/קניון EXPRESS\. מספר עוסק 033798513\. כל הזכויות שמורות\./)
    }
  })

  it('renders social media links with correct hrefs', () => {
    render(<SiteFooter />)
    const facebookLinks = screen.getAllByRole('link', { name: 'פייסבוק' })
    const instagramLinks = screen.getAllByRole('link', { name: 'אינסטגרם' })

    // Check desktop version (first one)
    expect(facebookLinks[0]).toHaveAttribute(
      'href',
      'https://www.facebook.com/קניון-Express-114398873446854/',
    )
    expect(instagramLinks[0]).toHaveAttribute('href', 'https://www.instagram.com/kenyonexpress')
    expect(facebookLinks[0]).toHaveAttribute('target', '_blank')
    expect(instagramLinks[0]).toHaveAttribute('target', '_blank')
  })

  it('renders payment method indicators on desktop', () => {
    render(<SiteFooter />)
    expect(screen.getByText('💳')).toBeInTheDocument()
    expect(screen.getByText('🏦')).toBeInTheDocument()
  })

  it('renders Hebrew heading level correctly', () => {
    render(<SiteFooter />)
    const aboutHeading = screen.getByRole('heading', { name: 'אודות' })
    expect(aboutHeading.tagName).toBe('H2')
  })

  it('applies correct CSS classes for responsiveness', () => {
    const { container } = render(<SiteFooter />)
    const desktopDiv = container.querySelector('.hidden.md\\:block')
    const mobileDiv = container.querySelector('.md\\:hidden')

    expect(desktopDiv).toBeInTheDocument()
    expect(mobileDiv).toBeInTheDocument()
  })

  it('renders footer with proper background color', () => {
    const { container } = render(<SiteFooter />)
    const footer = container.querySelector('footer')
    expect(footer).toHaveClass('bg-gray-900')
    expect(footer).toHaveClass('text-gray-300')
  })

  it('renders grid layout for desktop columns', () => {
    const { container } = render(<SiteFooter />)
    const desktopSection = container.querySelector('.hidden.md\\:block')
    const gridDiv = desktopSection?.querySelector('.grid.grid-cols-4')
    expect(gridDiv).toBeInTheDocument()
  })

  it('renders FooterAccordion component on mobile', () => {
    render(<SiteFooter />)
    // FooterAccordion should be present but only visible on mobile
    const mobileSection = document.querySelector('.md\\:hidden')
    expect(mobileSection).toBeInTheDocument()
  })

  it('renders all footer sections with proper link structure', () => {
    const { container } = render(<SiteFooter />)
    const lists = container.querySelectorAll('ul')
    expect(lists.length).toBeGreaterThan(0)

    for (const list of lists) {
      const items = list.querySelectorAll('li')
      for (const item of items) {
        expect(item.querySelector('a')).toBeInTheDocument()
      }
    }
  })

  it('applies hover styles to footer links', () => {
    render(<SiteFooter />)
    const link = screen.getByRole('link', { name: 'מי אנחנו' })
    expect(link).toHaveClass('hover:text-white')
    expect(link).toHaveClass('transition-colors')
  })

  it('renders social icons with proper styling', () => {
    const { container } = render(<SiteFooter />)
    const socialLinks = container.querySelectorAll('a[aria-label]')
    for (const link of socialLinks) {
      expect(link).toHaveClass('rounded-full')
      expect(link).toHaveClass('hover:bg-brand')
      expect(link).toHaveClass('transition-colors')
    }
  })
})
