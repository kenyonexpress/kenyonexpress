'use client'

import { PullToRefresh } from '@/components/mobile'
import { usePathname } from 'next/navigation'

interface MobileContentWrapperProps {
  children: React.ReactNode
}

export default function MobileContentWrapper({ children }: MobileContentWrapperProps) {
  const pathname = usePathname()
  const enablePullToRefresh = pathname === '/' || pathname.startsWith('/category')

  if (enablePullToRefresh) {
    return (
      <PullToRefresh
        onRefresh={async () => {
          if (typeof window !== 'undefined') {
            window.location.reload()
          }
        }}
      >
        {children}
      </PullToRefresh>
    )
  }

  return <>{children}</>
}
