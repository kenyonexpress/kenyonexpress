import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ModalAnimated from './ModalAnimated'

describe('ModalAnimated', () => {
  it('does not render when isOpen is false', () => {
    const { queryByText } = render(
      <ModalAnimated isOpen={false}>
        <div>Modal Content</div>
      </ModalAnimated>,
    )
    expect(queryByText('Modal Content')).not.toBeInTheDocument()
  })

  it('renders children when isOpen is true', () => {
    const { getByText } = render(
      <ModalAnimated isOpen={true}>
        <div>Modal Content</div>
      </ModalAnimated>,
    )
    expect(getByText('Modal Content')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const handleClose = vi.fn()
    const { container } = render(
      <ModalAnimated isOpen={true} onClose={handleClose}>
        <div>Modal Content</div>
      </ModalAnimated>,
    )
    const backdrop = container.querySelector('[class*="fixed"]')
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(handleClose).toHaveBeenCalled()
  })

  it('does not call onClose when modal content is clicked', () => {
    const handleClose = vi.fn()
    const { getByText } = render(
      <ModalAnimated isOpen={true} onClose={handleClose}>
        <div>Modal Content</div>
      </ModalAnimated>,
    )
    const modalContent = getByText('Modal Content')
    modalContent.dispatchEvent(new MouseEvent('click', { bubbles: false }))
    expect(handleClose).not.toHaveBeenCalled()
  })

  it('applies custom className to modal', () => {
    const { container } = render(
      <ModalAnimated isOpen={true} className="custom-modal">
        <div>Modal Content</div>
      </ModalAnimated>,
    )
    const modal = container.querySelector('.custom-modal')
    expect(modal).toBeInTheDocument()
  })

  it('has z-50 for high stacking context', () => {
    const { container } = render(
      <ModalAnimated isOpen={true}>
        <div>Modal Content</div>
      </ModalAnimated>,
    )
    const backdrop = container.querySelector('[class*="z-50"]')
    expect(backdrop).toBeInTheDocument()
  })
})
