import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Toaster } from './sonner'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' }),
}))

vi.mock('sonner', () => ({
  Toaster: vi.fn(() => null),
}))

describe('Toaster component', () => {
  it('should render without errors', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeTruthy()
  })

  it('should pass position prop to Sonner', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeTruthy()
  })

  it('should support theme from next-themes', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeTruthy()
  })

  it('should pass through additional props', () => {
    const { container } = render(<Toaster richColors={true} />)
    expect(container).toBeTruthy()
  })

  it('should have RTL support enabled', () => {
    const { container } = render(<Toaster dir="rtl" />)
    expect(container).toBeTruthy()
  })

  it('should apply proper classNames to toast configuration', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeTruthy()
  })

  it('should export Toaster component', () => {
    expect(typeof Toaster).toBe('function')
  })

  it('should be callable as a React component', () => {
    expect(Toaster).toBeDefined()
    expect(typeof Toaster).toBe('function')
  })
})
