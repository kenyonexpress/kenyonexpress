'use client'

import { EcUser } from '@/components/icons/electro-icons'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getTheme, saveTheme } from '@/lib/theme'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

export default function UserMenu({ email }: { email: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const currentTheme = getTheme()
    setTheme(currentTheme)
    setMounted(true)
  }, [])

  const handleThemeChange = (isDark: boolean) => {
    const newTheme: 'light' | 'dark' = isDark ? 'dark' : 'light'
    setTheme(newTheme)
    saveTheme(newTheme)
  }

  if (!mounted) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hit-44 -m-1 p-1 transition-opacity hover:opacity-70 flex items-center gap-1.5"
          aria-label="תפריט חשבון"
          style={{ color: ICON.color }}
        >
          <EcUser size={ICON.size} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm text-muted-foreground">{email}</div>
        <DropdownMenuSeparator />

        <Link href="/account" prefetch={false} className="block">
          <DropdownMenuItem>סקירה</DropdownMenuItem>
        </Link>
        <Link href="/account/details" className="block">
          <DropdownMenuItem>הפרטים שלי</DropdownMenuItem>
        </Link>
        <Link href="/account/orders" className="block">
          <DropdownMenuItem>ההזמנות שלי</DropdownMenuItem>
        </Link>

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={theme === 'dark'}
          onCheckedChange={handleThemeChange}
          className="cursor-pointer"
        >
          {theme === 'dark' ? '🌙 מצב כהה' : '☀️ מצב בהיר'}
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        <Link href="/api/auth/logout" className="block">
          <DropdownMenuItem className="text-destructive">התנתק</DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
