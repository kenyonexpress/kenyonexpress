#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const [, key, value] = match
      env[key.trim()] = value.trim().replace(/^"(.*)"$/, '$1')
    }
  }
  return env
}

const env = loadEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { count: remaining } = await supabase
  .from('products')
  .select('*', { count: 'exact', head: true })
  .eq('city', 'כל הארץ')
  .is('deleted_at', null)
  .eq('type', 'physical')

const { count: assigned } = await supabase
  .from('products')
  .select('*', { count: 'exact', head: true })
  .neq('city', 'כל הארץ')
  .is('deleted_at', null)
  .eq('type', 'physical')
  .not('latitude', 'is', null)

console.log(`Products still with nationwide default: ${remaining ?? 0}`)
console.log(`Physical products with assigned cities and coordinates: ${assigned ?? 0}`)
