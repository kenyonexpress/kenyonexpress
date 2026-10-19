import type { Metadata } from 'next'
import TestDialogClient from './test-dialog-client'

export const metadata: Metadata = {
  title: 'בדיקת דיאלוג - UX29',
  description: 'דף בדיקה לרכיב הדיאלוג עם כל תכונות UX29',
  robots: 'noindex, nofollow',
}

export default function TestDialogPage() {
  return <TestDialogClient />
}
