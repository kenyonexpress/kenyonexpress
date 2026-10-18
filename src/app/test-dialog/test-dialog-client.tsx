'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useState } from 'react'

export default function TestDialogClient() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">בדיקת רכיב דיאלוג - UX29</h1>

        <p className="text-gray-600 mb-6">דף זה מדגים את רכיב הדיאלוג עם כל תכונות UX29:</p>

        <ul className="list-disc list-inside space-y-2 text-gray-600 mb-8">
          <li>חופפה עם אפקט ערפל</li>
          <li>סגירה על esc</li>
          <li>סגירה בלחיצה על החופפה</li>
          <li>יצידת פוקוס (Tab)</li>
          <li>מסך מלא בנייד</li>
          <li>מרוכז בדסקטופ</li>
          <li>כפתור סגירה נגיש</li>
        </ul>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              data-testid="dialog-trigger"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              פתח דיאלוג בדיקה
            </button>
          </DialogTrigger>

          <DialogContent data-testid="dialog-content">
            <DialogHeader>
              <DialogTitle>בדיקת דיאלוג - תכונות UX29</DialogTitle>
              <DialogDescription>
                נסו: לחצו Escape, לחצו על החופפה, השתמשו ב-Tab כדי לנווט
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <p className="text-sm text-gray-700">
                דיאלוג זה מדגים את כל תכונות מערכת הדיאלוג של UX29:
              </p>

              <button
                data-testid="button-1"
                type="button"
                className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
              >
                כפתור ראשון
              </button>

              <input
                data-testid="test-input"
                type="text"
                placeholder="שדה קלט בדיקה"
                className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                data-testid="button-2"
                type="button"
                className="w-full px-4 py-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
              >
                כפתור שני
              </button>

              <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded">
                <p className="font-semibold mb-2">הוראות:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    לחצו <kbd className="bg-white px-2 py-1 rounded border">Escape</kbd> כדי לסגור
                  </li>
                  <li>
                    לחצו <kbd className="bg-white px-2 py-1 rounded border">Tab</kbd> כדי לנווט
                  </li>
                  <li>בדסקטופ, לחצו על החופפה כדי לסגור</li>
                  <li>לחצו על כפתור X כדי לסגור</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              >
                סגור דיאלוג
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="mt-12 p-6 bg-white rounded-lg border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">מצב דיאלוג</h2>
          <p className="text-sm text-gray-600">
            הדיאלוג כרגע: <span className="font-semibold">{open ? 'פתוח' : 'סגור'}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
