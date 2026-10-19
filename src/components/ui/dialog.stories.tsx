import type { Meta, StoryObj } from '@storybook/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

const meta = {
  title: 'UI/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Modal dialog component built with Radix UI. Supports triggers, headers, descriptions, and footer actions.',
      },
    },
  },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          פתח דיאלוג
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>כותרת הדיאלוג</DialogTitle>
          <DialogDescription>תיאור ברור של מה הדיאלוג עושה וממה הוא מוגבל.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-600">תוכן הדיאלוג כאן.</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            className="px-4 py-2 text-gray-600 border rounded hover:bg-gray-100"
          >
            ביטול
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            אישור
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const WithHebrewContent: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          פתח טופס רישום
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הרשמה לניוזלטר</DialogTitle>
          <DialogDescription>
            שתף את כתובת הדוא״ל שלך כדי לקבל עדכונים ודילים בלעדיים.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <form className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                שם מלא
              </label>
              <input
                id="name"
                type="text"
                placeholder="שם"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                כתובת דוא״ל
              </label>
              <input
                id="email"
                type="email"
                placeholder="דוא״ל"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
            </div>
          </form>
        </div>
        <DialogFooter>
          <button
            type="button"
            className="px-4 py-2 text-gray-600 border rounded hover:bg-gray-100"
          >
            סגור
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            הרשמה
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const ConfirmationDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="px-4 py-2 bg-error-600 text-white rounded hover:bg-error-700"
        >
          מחק פריט
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>אישור מחיקה</DialogTitle>
          <DialogDescription>פעולה זו אינה ניתנת לשינוי. האם אתה בטוח?</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-600">הפריט יימחק לצמיתות מהמערכת.</p>
        </div>
        <DialogFooter>
          <button
            type="button"
            className="px-4 py-2 text-gray-600 border rounded hover:bg-gray-100"
          >
            ביטול
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-error-600 text-white rounded hover:bg-error-700"
          >
            מחק כעת
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const AlertDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="px-4 py-2 bg-warning-600 text-white rounded hover:bg-warning-700"
        >
          הצג התראה
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>התראה חשובה</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-gray-600">
            יש לך יתרה פעילה בחשבונך. הודה בכך כדי להמשיך ברכישה.
          </p>
        </div>
        <DialogFooter>
          <button
            type="button"
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            הבנתי
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
