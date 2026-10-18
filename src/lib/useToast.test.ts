import * as sonner from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from './useToast'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(() => 'toast-id'),
    error: vi.fn(() => 'toast-id'),
    info: vi.fn(() => 'toast-id'),
    warning: vi.fn(() => 'toast-id'),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}))

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return toast functions', () => {
    const toast = useToast()
    expect(toast).toHaveProperty('success')
    expect(toast).toHaveProperty('error')
    expect(toast).toHaveProperty('info')
    expect(toast).toHaveProperty('warning')
    expect(toast).toHaveProperty('loading')
    expect(toast).toHaveProperty('dismiss')
  })

  it('should call success with correct duration', () => {
    const toast = useToast()
    toast.success('Success message')

    expect(sonner.toast.success).toHaveBeenCalledWith('Success message', {
      duration: 3000,
    })
  })

  it('should call error with longer duration', () => {
    const toast = useToast()
    toast.error('Error message')

    expect(sonner.toast.error).toHaveBeenCalledWith('Error message', {
      duration: 5000,
    })
  })

  it('should call info with default duration', () => {
    const toast = useToast()
    toast.info('Info message')

    expect(sonner.toast.info).toHaveBeenCalledWith('Info message', {
      duration: 3000,
    })
  })

  it('should call warning with longer duration', () => {
    const toast = useToast()
    toast.warning('Warning message')

    expect(sonner.toast.warning).toHaveBeenCalledWith('Warning message', {
      duration: 5000,
    })
  })

  it('should call loading with infinite duration', () => {
    const toast = useToast()
    toast.loading('Loading...')

    expect(sonner.toast.loading).toHaveBeenCalledWith('Loading...', {
      duration: Number.POSITIVE_INFINITY,
    })
  })

  it('should allow custom duration for success', () => {
    const toast = useToast()
    toast.success('Success message', { duration: 1000 })

    expect(sonner.toast.success).toHaveBeenCalledWith('Success message', {
      duration: 1000,
    })
  })

  it('should allow custom duration for error', () => {
    const toast = useToast()
    toast.error('Error message', { duration: 2000 })

    expect(sonner.toast.error).toHaveBeenCalledWith('Error message', {
      duration: 2000,
    })
  })

  it('should allow custom config options', () => {
    const toast = useToast()
    const action = { label: 'Undo', onClick: () => {} }
    toast.success('Success message', { action })

    expect(sonner.toast.success).toHaveBeenCalledWith('Success message', {
      duration: 3000,
      action,
    })
  })

  it('should dismiss specific toast by id', () => {
    const toast = useToast()
    toast.dismiss('toast-1')

    expect(sonner.toast.dismiss).toHaveBeenCalledWith('toast-1')
  })

  it('should dismiss all toasts', () => {
    const toast = useToast()
    toast.dismiss()

    expect(sonner.toast.dismiss).toHaveBeenCalledWith()
  })

  it('should support description in config', () => {
    const toast = useToast()
    toast.success('Success', { description: 'Operation completed' })

    expect(sonner.toast.success).toHaveBeenCalledWith('Success', {
      duration: 3000,
      description: 'Operation completed',
    })
  })

  it('should support multiple toasts in stack', () => {
    const toast = useToast()

    toast.success('First message')
    toast.info('Second message')
    toast.warning('Third message')

    expect(sonner.toast.success).toHaveBeenCalledTimes(1)
    expect(sonner.toast.info).toHaveBeenCalledTimes(1)
    expect(sonner.toast.warning).toHaveBeenCalledTimes(1)
  })

  it('should return toast id from success', () => {
    const toast = useToast()
    const id = toast.success('Message')

    expect(id).toBe('toast-id')
  })
})
