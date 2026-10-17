'use client'

import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  locale: string
  messages: Record<string, Record<string, string>>
}

export default function IntlProvider({ children, locale, messages }: Props) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
