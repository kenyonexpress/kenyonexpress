import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'דף בדיקת Dialog',
  description: 'דף בדיקה פנימי לבדיקות Dialog',
  robots: 'noindex, nofollow',
}

export default function TestDialogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
