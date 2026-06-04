import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // Pin the workspace root to this app directory. Without this, Next.js walks up
  // and may infer the parent folder as the root when multiple lockfiles exist,
  // emitting a "inferred your workspace root" warning. pnpm-lock.yaml lives here.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
    ],
  },
}

export default withNextIntl(nextConfig)
