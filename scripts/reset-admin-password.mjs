#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 1 || line.trimStart().startsWith('#')) continue
      const key = line.slice(0, eq).trim()
      if (!env[key]) env[key] = line.slice(eq + 1).trim()
    }
  } catch {}
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

const email = env.E2E_ADMIN_EMAIL || 'e2e-admin@test.kenyonexpress.local'
const password = env.E2E_ADMIN_PASSWORD || 'E2eAdmin!pass1'

console.log(`Resetting password for: ${email}`)

// Get user by email
const { data: users, error: listError } = await admin.auth.admin.listUsers()
if (listError) {
  console.error('Error listing users:', listError.message)
  process.exit(1)
}

const user = users.users.find((u) => u.email === email)
if (!user) {
  console.error(`User ${email} not found`)
  process.exit(1)
}

// Update password
const { error } = await admin.auth.admin.updateUserById(user.id, {
  password,
})

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

console.log(`Password reset for ${email}`)
