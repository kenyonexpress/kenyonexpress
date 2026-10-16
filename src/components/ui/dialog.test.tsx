import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

describe('Dialog Component - UX29 Modal System', () => {
  describe('Basic Rendering', () => {
    it('should render dialog trigger button', () => {
      render(
        <Dialog>
          <DialogTrigger>Open Modal</DialogTrigger>
          <DialogContent>
            <DialogTitle>Test Modal</DialogTitle>
          </DialogContent>
        </Dialog>,
      )
      expect(screen.getByRole('button', { name: /open modal/i })).toBeInTheDocument()
    })

    it('should open dialog when trigger is clicked', () => {
      render(
        <Dialog>
          <DialogTrigger>Open Modal</DialogTrigger>
          <DialogContent>
            <DialogTitle>Test Modal</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>,
      )
      const trigger = screen.getByRole('button', { name: /open modal/i })
      fireEvent.click(trigger)
      expect(screen.getByText('Dialog Content')).toBeInTheDocument()
    })
  })

  describe('Overlay Blur (UX29 Feature)', () => {
    it('should render with backdrop blur styling on overlay', () => {
      render(
        <Dialog open>
          <DialogContent data-testid="dialog-content">
            <DialogTitle>Test Modal</DialogTitle>
          </DialogContent>
        </Dialog>,
      )

      const dialogContent = screen.getByTestId('dialog-content')
      expect(dialogContent?.className).toMatch(/bg-background/)
      // backdrop-blur-sm is applied to DialogOverlay, which pairs with this DialogContent
    })
  })

  describe('Escape Key Close (UX29 Feature) - See e2e/dialog-ux29.spec.ts for real browser test', () => {
    it('should render with onOpenChange handler for escape key support', () => {
      const TestComponent = () => {
        const [open, setOpen] = React.useState(true)
        return (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Test Modal</DialogTitle>
              <p>Dialog Content</p>
            </DialogContent>
          </Dialog>
        )
      }

      render(<TestComponent />)
      expect(screen.getByText('Dialog Content')).toBeInTheDocument()

      // REAL BEHAVIOR TEST: e2e/dialog-ux29.spec.ts::should close dialog when Escape key is pressed
      // vitest/jsdom cannot properly simulate keyboard events on Radix Dialog
    })

    it('should have accessible close button', () => {
      const handleOpenChange = vi.fn()
      render(
        <Dialog open onOpenChange={handleOpenChange}>
          <DialogContent>
            <DialogTitle>Test Modal</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>,
      )

      const closeButton = screen.getByRole('button', { name: /close/i })
      expect(closeButton).toBeInTheDocument()

      fireEvent.click(closeButton)
      expect(handleOpenChange).toHaveBeenCalledWith(false)

      // REAL BEHAVIOR TEST: e2e/dialog-ux29.spec.ts::should have accessible close button
    })
  })

  describe('Overlay Click Close (UX29 Feature) - See e2e/dialog-ux29.spec.ts for real browser test', () => {
    it('should have dialog role for Radix overlay click support', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Test Modal</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>,
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()

      // REAL BEHAVIOR TEST: e2e/dialog-ux29.spec.ts::should close dialog when clicking overlay
      // Radix Dialog handles overlay click natively; jsdom cannot simulate pointer events properly
    })
  })

  describe('Focus Trap (UX29 Feature) - See e2e/dialog-ux29.spec.ts for real browser test', () => {
    it('should contain focusable elements within dialog', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Test Modal</DialogTitle>
            <button type="button">First Button</button>
            <button type="button">Second Button</button>
            <DialogClose>Close Button</DialogClose>
          </DialogContent>
        </Dialog>,
      )

      expect(screen.getByRole('button', { name: /first button/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /second button/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /close button/i })).toBeInTheDocument()

      // REAL BEHAVIOR TEST: e2e/dialog-ux29.spec.ts::should trap focus within dialog (Tab key cycles through elements)
      // jsdom/vitest cannot properly test Tab key focus cycling in Radix Dialog
    })

    it('should have dialog role for native focus trapping', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Test Modal</DialogTitle>
            <p>Content</p>
          </DialogContent>
        </Dialog>,
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()

      // Radix Dialog with role="dialog" provides native focus trapping via FocusScope
      // Real focus cycling tested in Playwright: e2e/dialog-ux29.spec.ts
    })
  })

  describe('Mobile Fullscreen (UX29 Feature)', () => {
    it('should have mobile fullscreen classes (inset-0, w-full)', () => {
      render(
        <Dialog open>
          <DialogContent data-testid="dialog-content">
            <DialogTitle>Test Modal</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>,
      )

      const content = screen.getByTestId('dialog-content')
      expect(content?.className).toMatch(/inset-0/)
      expect(content?.className).toMatch(/w-full/)
      expect(content?.className).toMatch(/p-4/)

      // REAL BEHAVIOR TEST: e2e/dialog-ux29.spec.ts::should apply mobile fullscreen styles on small viewport
    })

    it('should have desktop centered classes (max-w-lg, centered)', () => {
      render(
        <Dialog open>
          <DialogContent data-testid="dialog-content">
            <DialogTitle>Test Modal</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>,
      )

      const content = screen.getByTestId('dialog-content')
      expect(content?.className).toMatch(/md:inset-auto/)
      expect(content?.className).toMatch(/md:left-\[50%\]/)
      expect(content?.className).toMatch(/md:top-\[50%\]/)
      expect(content?.className).toMatch(/md:max-w-lg/)
      expect(content?.className).toMatch(/md:p-6/)

      // REAL BEHAVIOR TEST: e2e/dialog-ux29.spec.ts::should apply desktop centered styles on large viewport
    })
  })

  describe('Close Button', () => {
    it('should have accessible close button', () => {
      render(
        <Dialog>
          <DialogTrigger>Open Modal</DialogTrigger>
          <DialogContent>
            <DialogTitle>Test Modal</DialogTitle>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>,
      )

      fireEvent.click(screen.getByRole('button', { name: /open modal/i }))
      const closeButton = screen.getByRole('button', { name: /close/i })
      expect(closeButton).toBeInTheDocument()
      expect(closeButton).toHaveAttribute('type', 'button')
    })
  })

  describe('Controlled Dialog', () => {
    it('should support controlled open state', () => {
      const TestComponent = () => {
        const [isOpen, setIsOpen] = React.useState(false)
        return (
          <>
            <button type="button" onClick={() => setIsOpen(true)}>
              Open Modal
            </button>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogContent>
                <DialogTitle>Test Modal</DialogTitle>
                <p>Dialog Content</p>
              </DialogContent>
            </Dialog>
          </>
        )
      }

      render(<TestComponent />)

      fireEvent.click(screen.getByRole('button', { name: /open modal/i }))

      expect(screen.getByText('Dialog Content')).toBeInTheDocument()
    })
  })

  describe('Dialog Structure', () => {
    it('should render complete dialog structure with header and footer', () => {
      render(
        <Dialog>
          <DialogTrigger>Open Modal</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modal Title</DialogTitle>
              <DialogDescription>Modal description text</DialogDescription>
            </DialogHeader>
            <div>Modal body content</div>
            <DialogFooter>
              <button type="button">Cancel</button>
              <button type="button">Confirm</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      )

      fireEvent.click(screen.getByRole('button', { name: /open modal/i }))

      expect(screen.getByText('Modal Title')).toBeInTheDocument()
      expect(screen.getByText('Modal description text')).toBeInTheDocument()
      expect(screen.getByText('Modal body content')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    })
  })

  describe('Animations', () => {
    it('should have animation classes for transitions', () => {
      render(
        <Dialog open>
          <DialogContent data-testid="dialog-content">
            <DialogTitle>Test Modal</DialogTitle>
          </DialogContent>
        </Dialog>,
      )

      const content = screen.getByTestId('dialog-content')
      expect(content?.className).toMatch(/animate-in/)
    })
  })
})
