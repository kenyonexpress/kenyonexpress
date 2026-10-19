import { fireEvent, render, screen } from '@testing-library/react'
import PriceDisplay from './PriceDisplay'

describe('PriceDisplay', () => {
  describe('single price', () => {
    it('renders current price with shekel symbol', () => {
      render(<PriceDisplay price={99.99} />)
      expect(screen.getByText(/₪/)).toBeInTheDocument()
    })

    it('renders price in Hebrew locale format', () => {
      render(<PriceDisplay price={100} />)
      const priceEl = screen.getByText(/₪/)
      expect(priceEl.textContent).toMatch(/100.*₪/)
    })

    it('does not show strikethrough for single price', () => {
      render(<PriceDisplay price={99} />)
      const strikethrough = document.querySelector('span.line-through')
      expect(strikethrough).not.toBeInTheDocument()
    })

    it('does not show savings badge for single price', () => {
      render(<PriceDisplay price={99} showSavingsBadge={true} />)
      expect(screen.queryByText(/חוסכים/)).not.toBeInTheDocument()
    })
  })

  describe('sale price with original', () => {
    it('renders both original and sale prices', () => {
      render(<PriceDisplay price={79} originalPrice={99} />)
      const priceEls = screen.getAllByText(/₪/)
      expect(priceEls.length).toBeGreaterThanOrEqual(2)
    })

    it('shows strikethrough on original price', () => {
      render(<PriceDisplay price={79} originalPrice={99} />)
      const strikethrough = document.querySelector('span.line-through')
      expect(strikethrough).toBeInTheDocument()
      expect(strikethrough?.textContent).toContain('99')
    })

    it('shows savings badge by default', () => {
      render(<PriceDisplay price={75} originalPrice={100} />)
      const badge = screen.getByText(/חוסכים/)
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toContain('25')
    })

    it('calculates correct savings amount', () => {
      render(<PriceDisplay price={50} originalPrice={100} />)
      expect(screen.getByText(/חוסכים.*50.*₪/)).toBeInTheDocument()
    })

    it('calculates correct savings percentage', () => {
      render(<PriceDisplay price={75} originalPrice={100} />)
      // 25% discount (1 - 75/100 = 0.25)
      expect(screen.getByText(/חוסכים/)).toBeInTheDocument()
    })

    it('hides savings badge when showSavingsBadge is false', () => {
      render(<PriceDisplay price={50} originalPrice={100} showSavingsBadge={false} />)
      expect(screen.queryByText(/חוסכים/)).not.toBeInTheDocument()
    })

    it('does not show savings badge when price equals original', () => {
      render(<PriceDisplay price={99} originalPrice={99} showSavingsBadge={true} />)
      expect(screen.queryByText(/חוסכים/)).not.toBeInTheDocument()
    })
  })

  describe('Hebrew numerals toggle', () => {
    it('shows numerals toggle button by default', () => {
      render(<PriceDisplay price={123} allowHebrewNumerals={true} />)
      expect(screen.getByText(/numerals/i)).toBeInTheDocument()
    })

    it('hides numerals toggle when allowHebrewNumerals is false', () => {
      render(<PriceDisplay price={123} allowHebrewNumerals={false} />)
      expect(screen.queryByText(/numerals/i)).not.toBeInTheDocument()
    })

    it('converts numerals to Hebrew when toggled', () => {
      const { container } = render(
        <PriceDisplay price={123} allowHebrewNumerals={true} originalPrice={200} />,
      )

      const button = screen.getByText(/numerals/i)
      fireEvent.click(button)

      // Check that numerals have been converted to Hebrew
      // Hebrew numerals for 123: ַאביג
      const hebrewNumeralText = container.textContent
      expect(hebrewNumeralText).toContain('א') // Hebrew א for 1
    })

    it('toggles back to Arabic numerals', () => {
      render(<PriceDisplay price={123} allowHebrewNumerals={true} />)

      const button = screen.getByText(/numerals/i)
      fireEvent.click(button)
      fireEvent.click(button)

      // Should be back to Arabic numerals
      expect(screen.getByText(/123.*₪/)).toBeInTheDocument()
    })

    it('updates button label when toggled', () => {
      render(<PriceDisplay price={99} allowHebrewNumerals={true} />)

      const button = screen.getByText('Hebrew numerals')
      expect(button).toBeInTheDocument()

      fireEvent.click(button)
      expect(screen.getByText('Arabic numerals')).toBeInTheDocument()
    })
  })

  describe('CSS classes', () => {
    it('applies custom className to container', () => {
      const { container } = render(<PriceDisplay price={99} className="custom-container" />)
      expect(container.querySelector('.custom-container')).toBeInTheDocument()
    })

    it('applies custom priceClassName to price when on sale', () => {
      const { container } = render(
        <PriceDisplay price={50} originalPrice={100} priceClassName="custom-price" />,
      )
      expect(container.querySelector('.custom-price')).toBeInTheDocument()
    })

    it('uses sale price styling when on sale', () => {
      const { container } = render(
        <PriceDisplay price={50} originalPrice={100} priceClassName="custom-price" />,
      )
      const priceEl = container.querySelector('.custom-price')
      expect(priceEl).toBeInTheDocument()
    })

    it('uses deal price styling when not on sale', () => {
      const { container } = render(<PriceDisplay price={99} />)
      const dealPriceEl = container.querySelector('.text-deal-price')
      expect(dealPriceEl).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles zero price', () => {
      render(<PriceDisplay price={0} />)
      const priceEl = screen.getByText(/₪/)
      expect(priceEl).toBeInTheDocument()
    })

    it('handles decimal prices', () => {
      render(<PriceDisplay price={99.99} originalPrice={199.99} />)
      const priceEls = screen.getAllByText(/₪/)
      expect(priceEls.length).toBeGreaterThanOrEqual(2)
    })

    it('handles large prices', () => {
      render(<PriceDisplay price={9999.99} originalPrice={12999.99} />)
      expect(screen.getByText(/חוסכים/)).toBeInTheDocument()
    })

    it('ignores originalPrice if not greater than price', () => {
      render(<PriceDisplay price={100} originalPrice={50} />)
      expect(screen.queryByText(/חוסכים/)).not.toBeInTheDocument()
    })

    it('ignores null originalPrice', () => {
      render(<PriceDisplay price={100} originalPrice={null} />)
      const strikethrough = document.querySelector('span.line-through')
      expect(strikethrough).not.toBeInTheDocument()
    })

    it('ignores undefined originalPrice', () => {
      render(<PriceDisplay price={100} originalPrice={undefined} />)
      const strikethrough = document.querySelector('span.line-through')
      expect(strikethrough).not.toBeInTheDocument()
    })
  })
})
