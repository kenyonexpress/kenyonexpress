'use client'

import { EcUser } from '@/components/icons/electro-icons'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { getTheme, saveTheme } from '@/lib/theme'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function UserMenuDropdown() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)

  useEffect(() => {
    const currentTheme = getTheme()
    setTheme(currentTheme)
  }, [])

  if (theme === null) {
    return (
      <Link
        href="/login"
        className="hit-44 flex h-topbar-row items-center gap-1.5 text-icon transition-colors duration-200 hover:text-heading"
      >
        <EcUser size={16} aria-hidden="true" className="shrink-0" />
        התחברות
      </Link>
    )
  }

  const handleThemeChange = (isDark: boolean) => {
    const newTheme = isDark ? 'dark' : 'light'
    setTheme(newTheme)
    saveTheme(newTheme)
  }

  return (
    <DropdownMenu>
      <button
        type="button"
        className="hit-44 flex h-topbar-row items-center gap-1.5 text-icon transition-colors duration-200 hover:text-heading"
        aria-label="תפריט משתמש"
      >
        <EcUser size={16} aria-hidden="true" className="shrink-0" />
        תפריט
      </button>

      <DropdownMenuContent align="end" className="w-56">
        <Link href="/account" className="block">
          <button
            type="button"
            className="w-full text-start px-2 py-1.5 text-sm hover:bg-accent rounded"
          >
            סקירה
          </button>
        </Link>
        <Link href="/account/orders" className="block">
          <button
            type="button"
            className="w-full text-start px-2 py-1.5 text-sm hover:bg-accent rounded"
          >
            ההזמנות שלי
          </button>
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
          <button
            type="button"
            className="w-full text-start px-2 py-1.5 text-sm text-destructive hover:bg-accent rounded"
          >
            התנתק
          </button>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
