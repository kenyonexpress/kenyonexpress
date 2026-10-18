'use client'

import { toast } from 'sonner'
import type { ExternalToast } from 'sonner'

type ToastVariant = 'success' | 'error' | 'info' | 'warning'

interface ToastConfig extends ExternalToast {
  variant?: ToastVariant
}

const DEFAULT_DURATION = 3000
const DURATION_LONG = 5000
const DURATION_PERSISTENT = Number.POSITIVE_INFINITY

export const useToast = () => {
  const showToast = (message: string, config: ToastConfig = {}) => {
    const { variant = 'info', duration = DEFAULT_DURATION, ...restConfig } = config

    return toast[variant](message, {
      duration,
      ...restConfig,
    })
  }

  return {
    success: (message: string, config?: Omit<ToastConfig, 'variant'>) =>
      showToast(message, {
        ...config,
        variant: 'success',
        duration: config?.duration ?? DEFAULT_DURATION,
      }),

    error: (message: string, config?: Omit<ToastConfig, 'variant'>) =>
      showToast(message, {
        ...config,
        variant: 'error',
        duration: config?.duration ?? DURATION_LONG,
      }),

    info: (message: string, config?: Omit<ToastConfig, 'variant'>) =>
      showToast(message, {
        ...config,
        variant: 'info',
        duration: config?.duration ?? DEFAULT_DURATION,
      }),

    warning: (message: string, config?: Omit<ToastConfig, 'variant'>) =>
      showToast(message, {
        ...config,
        variant: 'warning',
        duration: config?.duration ?? DURATION_LONG,
      }),

    loading: (message: string, config?: Omit<ToastConfig, 'variant'>) =>
      toast.loading(message, { duration: DURATION_PERSISTENT, ...config }),

    dismiss: (toastId?: string | number) => {
      if (toastId !== undefined) {
        toast.dismiss(toastId)
      } else {
        toast.dismiss()
      }
    },
  }
}

export type UseToastReturn = ReturnType<typeof useToast>
