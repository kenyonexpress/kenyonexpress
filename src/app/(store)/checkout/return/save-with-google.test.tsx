import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/guest-upgrade', () => ({ linkGoogleAfterCheckout: vi.fn() }))

import SaveWithGoogle from './SaveWithGoogle'

describe('SaveWithGoogle (S07)', () => {
  it('posts the return page as the place to come back to', () => {
    const { container } = render(<SaveWithGoogle next="/checkout/return?order_id=o1" />)
    const next = container.querySelector('input[name="next"]') as HTMLInputElement
    expect(next.value).toBe('/checkout/return?order_id=o1')
    expect(screen.getByRole('button', { name: 'שמירת ההזמנה עם Google' })).toBeTruthy()
  })

  it('is rendered by the return page for an anonymous session only', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(store)/checkout/return/page.tsx'),
      'utf8',
    )
    expect(page).toContain('viewer?.is_anonymous === true')
    expect(page).toMatch(/\{isGuest && <SaveWithGoogle /)
  })
})
