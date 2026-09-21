import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ComponentGalleryPage from './page'

/**
 * The gallery is the design-system's only rendered inventory, so a primitive
 * that stops rendering should fail here and not on the day someone opens
 * /dev/components. jsdom renders the Radix pieces closed, which is enough.
 */
describe('/dev/components', () => {
  it('renders every primitive group with the site tokens', () => {
    render(<ComponentGalleryPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('רכיבי מערכת העיצוב')
    for (const group of ['כפתורים', 'טפסים', 'כרטיס', 'דיאלוג']) {
      expect(screen.getByRole('heading', { level: 2, name: group })).toBeInTheDocument()
    }
    // 6 variants × 3 sizes, plus one disabled per size, plus the dialog trigger and two card buttons.
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(6 * 3 + 3 + 3)
    expect(screen.getByLabelText('שם מלא')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /צבעי האתר \(\d+\)/ })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl')
  })
})
