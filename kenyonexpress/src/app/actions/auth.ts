'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const hebrewError: Record<string, string> = {
  'Invalid login credentials': 'כתובת אימייל או סיסמה שגויים',
  'Email not confirmed': 'כתובת האימייל טרם אומתה — בדקו את תיבת הדואר',
  'User already registered': 'כתובת האימייל כבר רשומה במערכת',
  'Password should be at least 6 characters': 'הסיסמה חייבת להכיל לפחות 6 תווים',
  'Signup is disabled': 'ההרשמה סגורה כרגע',
}

function toHebrew(msg: string): string {
  return hebrewError[msg] ?? 'אירעה שגיאה, נסו שוב'
}

export type AuthState = { error: string } | null

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })
  if (error) return { error: toHebrew(error.message) }
  redirect('/')
}

export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: {
      data: { full_name: formData.get('full_name') as string },
    },
  })
  if (error) return { error: toHebrew(error.message) }
  redirect('/signup/confirm')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
