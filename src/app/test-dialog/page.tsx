'use client'

/**
 * Test page for UX29 Modal Dialog component verification.
 * This page is ONLY for testing the Dialog component behavior via Playwright e2e tests.
 */

import { useEffect, useState } from 'react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function TestDialogPage() {
  const [isOpen, setIsOpen] = useState(false)
  const [testResults] = useState<string[]>([])
  const [viewportSize, setViewportSize] = useState<string>('-')

  useEffect(() => {
    const updateSize = () => {
      setViewportSize(`${window.innerWidth}x${window.innerHeight}`)
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">דף בדיקת רכיב Dialog</h1>
      <p className="text-sm text-gray-600">דף זה מיועד לבדיקות Playwright בלבד.</p>

      {/* Test Results Display */}
      {testResults.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <h2 className="font-bold text-blue-900">תוצאות בדיקה:</h2>
          <ul className="list-disc list-inside space-y-1">
            {testResults.map((result) => (
              <li key={result} className="text-sm text-blue-800">
                {result}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dialog Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        data-testid="dialog-trigger"
      >
        פתח דיאלוג
      </button>

      {/* Dialog Component */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent data-testid="dialog-content" className="space-y-4">
          <DialogHeader>
            <DialogTitle>דיאלוג בדיקה</DialogTitle>
            <DialogDescription>דיאלוג זה בוחן תכונות UX29</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p>תוכן הדיאלוג לבדיקת התנהגות.</p>

            {/* Focusable elements for focus trap testing */}
            <div className="space-y-2">
              <button
                type="button"
                className="block w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                data-testid="button-1"
              >
                כפתור 1
              </button>
              <button
                type="button"
                className="block w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
                data-testid="button-2"
              >
                כפתור 2
              </button>
              <input
                type="text"
                placeholder="קלט בדיקה"
                className="w-full px-4 py-2 border border-gray-300 rounded"
                data-testid="test-input"
              />
            </div>

            {/* Close button for testing */}
            <DialogClose className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
              סגור דיאלוג (via DialogClose)
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual close button for testing overlay close */}
      {isOpen && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">הדיאלוג פתוח כרגע. נסה:</p>
          <ul className="text-sm text-yellow-800 list-disc list-inside mt-2 space-y-1">
            <li>לחץ Escape כדי לסגור</li>
            <li>לחץ מחוץ לדיאלוג (על הריפוי הכהה) כדי לסגור</li>
            <li>לחץ Tab כדי לחזור על אלמנטים ניתנים לפוקוס</li>
            <li>שנה את גודל חלון הדפדפן שלך כדי לבדוק התנהגות מודעת</li>
          </ul>
        </div>
      )}

      {/* Viewport info for testing responsive behavior */}
      <div className="text-xs text-gray-500 mt-8 p-4 border border-gray-200 rounded bg-gray-50">
        <p>
          Current viewport: <span>{viewportSize}</span>
        </p>
      </div>
    </main>
  )
}
