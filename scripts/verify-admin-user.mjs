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

const admin = createClient(url, key, { auth: { persistSession: false } })

const email = env.E2E_ADMIN_EMAIL || 'e2e-admin@test.kenyonexpress.local'

// Get user
const { data: users } = await admin.auth.admin.listUsers()
const user = users.users.find((u) => u.email === email)

if (!user) {
  console.error('User not found')
  process.exit(1)
}

console.log('User found:', user.email)
console.log('User ID:', user.id)
console.log('Email confirmed:', user.email_confirmed_at ? 'Yes' : 'No')
console.log('User metadata:', JSON.stringify(user.user_metadata, null, 2))
console.log('App metadata:', JSON.stringify(user.app_metadata, null, 2))

// Check if user has a profile with role
const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single()
console.log('\nProfile:', JSON.stringify(profile, null, 2))
