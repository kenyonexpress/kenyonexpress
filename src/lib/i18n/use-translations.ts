'use client'

import { useTranslations as useNextIntlTranslations } from 'next-intl'

export function useTranslations(namespace?: string) {
  return useNextIntlTranslations(namespace)
}

export function useTranslation(key: string, namespace?: string) {
  const t = useNextIntlTranslations(namespace)
  return t(key)
}
