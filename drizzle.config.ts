import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.SUPABASE_DB_URL

if (!databaseUrl) {
  throw new Error('SUPABASE_DB_URL is required for Drizzle commands')
}

export default defineConfig({
  schema: './src/db/schema/commerce.ts',
  out: './supabase/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
})
