import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FooterAccordion from './FooterAccordion'

const mockColumns = [
  {
    title: 'אודות',
    links: [
      { label: 'מי אנחנו', href: '/about' },
      { label: 'קריירה', href: '#' },
    ],
  },
  {
    title: 'שירות לקוחות',
    links: [
      { label: 'שאלות נפוצות', href: '#' },
      { label: 'מעקב הזמנה', href: '#' },
    ],
  },
]

const mockSocials = [
  {
    label: 'פייסבוק',
    href: 'https://www.facebook.com/קניון-Express-114398873446854/',
  },
  {
    label: 'אינסטגרם',
    href: 'https://www.instagram.com/kenyonexpress',
  },
]

describe('FooterAccordion', () => {
  it('renders accordion sections for each column', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    expect(screen.getByText('אודות')).toBeInTheDocument()
    expect(screen.getByText('שירות לקוחות')).toBeInTheDocument()
  })

  it('renders accordion buttons with type="button"', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const buttons = screen.getAllByRole('button')
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button')
    }
  })

  it('expands accordion section when button is clicked', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const aboutButton = screen.getByRole('button', { name: /אודות/ })
    expect(aboutButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(aboutButton)
    expect(aboutButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('displays accordion links when expanded', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const aboutButton = screen.getByRole('button', { name: /אודות/ })
    fireEvent.click(aboutButton)

    expect(screen.getByRole('link', { name: 'מי אנחנו' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'קריירה' })).toBeInTheDocument()
  })

  it('collapses accordion when clicked again', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const aboutButton = screen.getByRole('button', { name: /אודות/ })

    fireEvent.click(aboutButton)
    expect(aboutButton).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(aboutButton)
    expect(aboutButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders social media section', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)
    expect(screen.getByText('עקבו אחרינו')).toBeInTheDocument()
  })

  it('renders social media links with correct hrefs', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const facebookLink = screen.getByRole('link', { name: 'פייסבוק' })
    const instagramLink = screen.getByRole('link', { name: 'אינסטגרם' })

    expect(facebookLink).toHaveAttribute(
      'href',
      'https://www.facebook.com/קניון-Express-114398873446854/',
    )
    expect(instagramLink).toHaveAttribute('href', 'https://www.instagram.com/kenyonexpress')
  })

  it('opens social media links in new tabs', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const facebookLink = screen.getByRole('link', { name: 'פייסבוק' })
    const instagramLink = screen.getByRole('link', { name: 'אינסטגרם' })

    expect(facebookLink).toHaveAttribute('target', '_blank')
    expect(instagramLink).toHaveAttribute('target', '_blank')
    expect(facebookLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(instagramLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders payment methods section', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)
    expect(screen.getByText('אמצעי תשלום')).toBeInTheDocument()
  })

  it('renders payment method indicators', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)
    expect(screen.getByText('💳 כרטיס אשראי')).toBeInTheDocument()
    expect(screen.getByText('🏦 העברה בנקאית')).toBeInTheDocument()
  })

  it('applies correct CSS classes to accordion buttons', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const buttons = screen.getAllByRole('button')
    for (const button of buttons) {
      expect(button).toHaveClass('w-full')
      expect(button).toHaveClass('py-4')
      expect(button).toHaveClass('px-4')
      expect(button).toHaveClass('text-start')
      expect(button).toHaveClass('text-white')
      expect(button).toHaveClass('text-button-small')
    }
  })

  it('applies correct CSS classes to expanded content', () => {
    const { container } = render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const aboutButton = screen.getByRole('button', { name: /אודות/ })
    fireEvent.click(aboutButton)

    const expandedList = container.querySelector('.bg-gray-700')
    expect(expandedList).toBeInTheDocument()
    expect(expandedList).toHaveClass('space-y-3')
  })

  it('rotates arrow icon on expand/collapse', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const aboutButton = screen.getByRole('button', { name: /אודות/ })
    const span = aboutButton.querySelector('span')

    expect(span).toHaveClass('transition-transform')
    expect(span).toHaveClass('duration-200')

    // Initially should not have rotate-180
    expect(span?.className).not.toContain('rotate-180')

    fireEvent.click(aboutButton)
    // Should have rotate-180 class when expanded
    expect(span?.className).toContain('rotate-180')
  })

  it('renders multiple independent accordion sections', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const aboutButton = screen.getByRole('button', { name: /אודות/ })
    const customerServiceButton = screen.getByRole('button', { name: /שירות לקוחות/ })

    fireEvent.click(aboutButton)
    expect(aboutButton).toHaveAttribute('aria-expanded', 'true')
    expect(customerServiceButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(customerServiceButton)
    expect(aboutButton).toHaveAttribute('aria-expanded', 'true')
    expect(customerServiceButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders accordion links with proper styling', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    const aboutButton = screen.getByRole('button', { name: /אודות/ })
    fireEvent.click(aboutButton)

    const link = screen.getByRole('link', { name: 'מי אנחנו' })
    expect(link).toHaveClass('text-sm')
    expect(link).toHaveClass('text-gray-300')
    expect(link).toHaveClass('hover:text-white')
    expect(link).toHaveClass('transition-colors')
  })

  it('renders social icons with proper styling', () => {
    render(<FooterAccordion columns={mockColumns} socials={mockSocials} />)

    // Check that social links have proper classes
    const facebookLink = screen.getByRole('link', { name: 'פייסבוק' })
    expect(facebookLink).toHaveClass('rounded-full')
    expect(facebookLink).toHaveClass('hover:bg-brand')
    expect(facebookLink).toHaveClass('transition-colors')
  })

  it('handles empty columns gracefully', () => {
    render(<FooterAccordion columns={[]} socials={mockSocials} />)
    expect(screen.getByText('עקבו אחרינו')).toBeInTheDocument()
    expect(screen.getByText('אמצעי תשלום')).toBeInTheDocument()
  })

  it('handles empty socials gracefully', () => {
    render(<FooterAccordion columns={mockColumns} socials={[]} />)
    expect(screen.getByText('אודות')).toBeInTheDocument()
    expect(screen.getByText('אמצעי תשלום')).toBeInTheDocument()
  })
})
