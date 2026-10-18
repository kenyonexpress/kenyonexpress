'use client'

import { useToast } from '@/lib/useToast'
import { useState } from 'react'

export function ToastDemo() {
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(false)
  let loadingToastId: string | number | null = null

  const handleSuccess = () => {
    toast.success('Operation completed successfully!', {
      description: 'Your changes have been saved.',
    })
  }

  const handleError = () => {
    toast.error('Something went wrong!', {
      description: 'Please try again later.',
      action: {
        label: 'Retry',
        onClick: () => handleError(),
      },
    })
  }

  const handleInfo = () => {
    toast.info('This is an informational message.', {
      description: 'Take note of this information.',
    })
  }

  const handleWarning = () => {
    toast.warning('This action cannot be undone!', {
      description: 'Please proceed with caution.',
    })
  }

  const handleLoading = () => {
    setIsLoading(true)
    loadingToastId = toast.loading('Processing your request...')

    setTimeout(() => {
      if (loadingToastId) toast.dismiss(loadingToastId)
      toast.success('Process completed!', {
        description: 'Your request has been processed successfully.',
      })
      setIsLoading(false)
    }, 3000)
  }

  const handleMultiple = () => {
    toast.info('First message')
    setTimeout(() => toast.success('Second message'), 500)
    setTimeout(() => toast.warning('Third message'), 1000)
  }

  return (
    <div className="space-y-4 p-6">
      <div className="rounded-lg border border-border bg-background p-6">
        <h2 className="mb-4 text-lg font-semibold">הדגמת התראות Toast</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Click any button below to see the toast notification in action.
        </p>

        <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
          <button
            type="button"
            onClick={handleSuccess}
            className="rounded-md bg-green-100 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-200"
          >
            Success
          </button>

          <button
            type="button"
            onClick={handleError}
            className="rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
          >
            Error
          </button>

          <button
            type="button"
            onClick={handleInfo}
            className="rounded-md bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200"
          >
            Info
          </button>

          <button
            type="button"
            onClick={handleWarning}
            className="rounded-md bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200"
          >
            Warning
          </button>

          <button
            type="button"
            onClick={handleLoading}
            disabled={isLoading}
            className="rounded-md bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
          >
            Loading
          </button>

          <button
            type="button"
            onClick={handleMultiple}
            className="rounded-md bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-200"
          >
            Stack (3x)
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted p-6">
        <h3 className="mb-3 font-semibold">Features</h3>
        <ul className="space-y-2 text-sm">
          <li>✓ Four variants: success, error, info, warning</li>
          <li>✓ Auto-dismiss with configurable durations</li>
          <li>✓ Stack management (multiple toasts at once)</li>
          <li>✓ Custom icons with color-coded styling</li>
          <li>✓ Loading state with spinner animation</li>
          <li>✓ Action buttons and descriptions</li>
          <li>✓ RTL support for Hebrew text</li>
          <li>✓ Dismissable with manual control</li>
        </ul>
      </div>
    </div>
  )
}
