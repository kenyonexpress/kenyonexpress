# Brand Assets

## Logo

**Text:** קניון EXPRESS  
**Font:** Heebo Bold (700 weight)  
**Color:** #fed700 (yellow)  
**Background:** White (#ffffff)  
**Direction:** RTL (Hebrew)

## Generated Assets

All brand assets are generated from a single source using `scripts/generate-brand-assets.mjs`:

```bash
node scripts/generate-brand-assets.mjs
```

### Files

- **`public/logo.svg`** — Vector master (400×120)
  - Primary logo file, used in UI components
  - Scalable for any display size
  - Includes Google Fonts Heebo reference

- **`public/logo-192.png`** — PWA icon (192×192)
  - Used in `manifest.ts` for PWA installation
  - Square format for app icons

- **`public/logo-512.png`** — PWA icon (512×512)
  - Used in `manifest.ts` for PWA installation
  - Higher resolution square format

- **`public/apple-touch-icon.png`** — Apple touch icon (180×180)
  - Referenced in `layout.tsx` metadata
  - Used by iOS for home screen icons

- **`public/favicon.ico`** — Favicon (32×32)
  - **Note:** This is a PNG file with `.ico` extension
  - Modern browsers (Chrome, Firefox, Safari, Edge) fully support PNG-format favicons
  - Referenced in `layout.tsx` metadata
  - 32×32 resolution is the standard favicon size

- **`public/og-default.png`** — Open Graph image (1200×630)
  - Includes logo and tagline: "הדילים הכי זולים בישראל"
  - Used for social media previews
  - Referenced in `layout.tsx` openGraph metadata

- **`public/icons/icon-*.png`** — Additional PWA icons
  - Referenced in `manifest.ts`
  - Includes maskable variant for adaptive icons on Android

## Verification

Brand assets are verified by two gates:

### 1. Visual Verification
```bash
node scripts/verify-brand-assets.mjs
```
Checks:
- File existence and dimensions
- Non-blank content (confirms text rendered)
- SVG contains Hebrew text, yellow color, Heebo font

### 2. Lint Gate
```bash
pnpm lint
```
Includes `scripts/brand-assets-gate.mjs` which verifies:
- Required assets exist and are non-trivial (minimum file sizes)
- Forbidden Next.js defaults are removed
- `layout.tsx` metadata references all brand assets
- SVG contains required brand elements

## Next.js Defaults Removed

The following Next.js default placeholder files were removed:
- `public/next.svg`
- `public/vercel.svg`
- `public/file.svg`
- `public/globe.svg`
- `public/window.svg`

## Favicon Format Note

The `favicon.ico` file is a 32×32 PNG with `.ico` extension rather than a true multi-resolution ICO file. This is acceptable because:

1. **Modern browser support:** All current browsers (Chrome 4+, Firefox 3.5+, Safari 3.1+, Edge) fully support PNG favicons, whether named `.png` or `.ico`
2. **Simplicity:** A single 32×32 resolution is sufficient for the favicon use case
3. **Build tooling:** Sharp (our image processing library) doesn't support ICO output, and adding another dependency solely for ICO conversion adds complexity without browser-compatibility benefit

If a true multi-resolution ICO is needed in the future, the `generate-brand-assets.mjs` script can be extended with a dedicated ICO generation library.

## Regeneration

To regenerate all brand assets from source:

```bash
node scripts/generate-brand-assets.mjs
node scripts/verify-brand-assets.mjs
pnpm lint
```

The generation script is idempotent and safe to run at any time.
