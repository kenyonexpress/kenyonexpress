'use client'

import { PHONE_PLACEHOLDER_IL, maskPhoneIL } from '@/lib/formatters'
import { useState } from 'react'
import { Input, type InputProps } from './input'

interface PhoneInputProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
  value?: string
  onChange?: (value: string) => void
}

/**
 * Phone input with Israeli (+972) formatting and masking.
 * Automatically formats as user types: 050-123-4567
 */
export function PhoneInput({ value, onChange, placeholder, ...props }: PhoneInputProps) {
  const [displayValue, setDisplayValue] = useState(value ? maskPhoneIL(value) : '')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const masked = maskPhoneIL(raw)
    setDisplayValue(masked)
    onChange?.(masked)
  }

  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      dir="ltr"
      value={displayValue}
      onChange={handleChange}
      placeholder={placeholder || PHONE_PLACEHOLDER_IL}
      {...props}
    />
  )
}
