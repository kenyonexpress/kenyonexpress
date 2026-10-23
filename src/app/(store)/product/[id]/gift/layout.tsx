import { Suspense } from 'react'

export default function GiftLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>טוען...</div>}>
      {children}
    </Suspense>
  )
}
