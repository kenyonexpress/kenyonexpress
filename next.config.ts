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
    qualities: [75, 90, 95],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
      // Seed/demo product images (024_seed_demo_products). Without this host in
      // the allowlist, next/image throws and every demo product page 500s.
      { protocol: 'https', hostname: 'picsum.photos' },
      // R2 public CDN (image pipeline renditions)
      { protocol: 'https', hostname: '*.kenyonexpress.co.il' },
      { protocol: 'https', hostname: '*.r2.dev' },
    ],
  },
  experimental: {
    serverActions: {
      // The image pipeline posts original files (up to 8MB) to a server action
      // for sharp processing before upload to R2/Supabase.
      bodySizeLimit: '10mb',
    },
  },
}

export default withNextIntl(nextConfig)
