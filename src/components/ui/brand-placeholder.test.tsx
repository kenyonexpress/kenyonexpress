import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BrandPlaceholder from './BrandPlaceholder'

/**
 * THE SLOT THAT IS WAITING FOR A PHOTOGRAPH HAS TO SAY SO TO EVERYONE.
 *
 * Ten Electro demo photographs were removed from the homepage on 2026-09-04 and
 * these slots took their place. A sighted visitor can see that a photograph is
 * missing; before this, a screen-reader user could not, because the placeholder
 * was aria-hidden with an empty alt. The slot was silently absent for them
 * rather than visibly empty.
 */
describe('BrandPlaceholder', () => {
  it('names the slot in Hebrew and says the photograph is not taken yet', () => {
    render(<BrandPlaceholder slot="תמונת הבאנר הראשי" />)
    const img = screen.getByRole('img', { name: /תמונת הבאנר הראשי/ })
    expect(img.getAttribute('alt')).toContain('התמונה טרם צולמה')
  })

  it('stays decorative when the caller gives it no slot', () => {
    // Inside a link that already names its destination, repeating the name is
    // noise. Then and only then is the mark genuinely decoration.
    const { container } = render(<BrandPlaceholder />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('is greppable, so every unfilled slot can be counted', () => {
    const { container } = render(<BrandPlaceholder slot="תמונת מוצר" />)
    expect(container.querySelector('[data-awaiting-photography]')).not.toBeNull()
  })

  it('sits on a neutral ground, not on a brand colour', () => {
    // A coloured panel reads as a design decision. A placeholder must not.
    const { container } = render(<BrandPlaceholder slot="תמונת מוצר" />)
    const box = container.querySelector('[data-awaiting-photography]')
    expect(box?.className).toContain('bg-surface-hover')
    expect(box?.className).not.toContain('bg-brand')
  })
})
