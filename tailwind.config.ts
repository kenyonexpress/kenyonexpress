import type { Config } from 'tailwindcss'

/**
 * Tailwind configuration for KenyonExpress.
 *
 * All color tokens reference CSS variables defined in src/styles/tokens.css @theme block.
 * This config extends the Tailwind theme with semantic color utilities for:
 * - Primary brand yellow (#fed700) with hover/focus states
 * - Functional colors (price, error, success, link, heading)
 * - Neutral colors (borders, dividers, muted text)
 * - Surface colors (backgrounds, papers, panels)
 * - Promo tints and third-party brand colors
 */

export default {
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--color-brand-primary)',
          hover: 'var(--color-brand-primary-hover)',
          focus: 'var(--color-brand-primary-focus)',
          dark: 'var(--color-brand-dark)',
          accent: 'var(--color-brand-accent)',
        },
        primary: 'var(--color-primary)',
        'primary-foreground': 'var(--color-primary-foreground)',
        price: 'var(--color-price)',
        'price-strike': 'var(--color-price-strike)',
        'deal-price': 'var(--color-deal-price)',
        'deal-sale': 'var(--color-deal-sale)',
        'deal-badge': 'var(--color-deal-badge)',
        success: 'var(--color-success)',
        error: 'var(--color-error)',
        link: 'var(--color-link)',
        heading: 'var(--color-heading)',
        'heading-hover': 'var(--color-heading-hover)',
        'sale-badge': 'var(--color-sale-badge)',
        border: 'var(--color-border)',
        'border-alt': 'var(--color-border-alt)',
        rule: 'var(--color-rule)',
        muted: 'var(--color-muted)',
        'muted-2': 'var(--color-muted-2)',
        icon: 'var(--color-icon)',
        'icon-empty': 'var(--color-icon-empty)',
        'drawer-border': 'var(--color-drawer-border)',
        'drawer-text': 'var(--color-drawer-text)',
        surface: 'var(--color-surface)',
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        ink: 'var(--color-ink)',
        'surface-hover': 'var(--color-surface-hover)',
        hover: 'var(--color-surface-hover)',
        track: 'var(--color-track)',
        'bottom-bar': 'var(--color-bottom-bar)',
        'warning-surface': 'var(--color-warning-surface)',
        warning: 'var(--color-warning-surface)',
        'footer-bg': 'var(--color-footer-bg)',
        footer: 'var(--color-footer-bg)',
        'drawer-bg': 'var(--color-drawer-bg)',
        drawer: 'var(--color-drawer-bg)',
        'drawer-hover': 'var(--color-drawer-hover)',
        'hero-slider-bg': 'var(--color-hero-slider-bg)',
        'hero-slider': 'var(--color-hero-slider-bg)',
        'promo-rose': 'var(--color-promo-rose)',
        'promo-violet': 'var(--color-promo-violet)',
        'promo-sky': 'var(--color-promo-sky)',
        'promo-flame': 'var(--color-promo-flame)',
        whatsapp: 'var(--color-whatsapp)',
        'whatsapp-ink': 'var(--color-whatsapp-ink)',
        'whatsapp-ink-hover': 'var(--color-whatsapp-ink-hover)',
        facebook: 'var(--color-facebook)',
        'payment-visa': 'var(--color-payment-visa)',
        'payment-mastercard-red': 'var(--color-payment-mastercard-red)',
        'payment-mastercard-orange': 'var(--color-payment-mastercard-orange)',
        'payment-mastercard-overlap': 'var(--color-payment-mastercard-overlap)',
        'payment-amex': 'var(--color-payment-amex)',
        'payment-isracard': 'var(--color-payment-isracard)',
        'payment-diners': 'var(--color-payment-diners)',
        'payment-badge': 'var(--color-payment-badge)',
      },
      fontSize: {
        nano: 'var(--text-nano)',
        badge: 'var(--text-badge)',
        micro: 'var(--text-micro)',
        'section-title': 'var(--text-section-title)',
        'footer-note': 'var(--text-footer-note)',
        topbar: 'var(--text-topbar)',
        'footer-link': 'var(--text-footer-link)',
        'footer-head': 'var(--text-footer-head)',
        'footer-phone': 'var(--text-footer-phone)',
        'pdp-title': 'var(--text-pdp-title)',
        'pdp-body': 'var(--text-pdp-body)',
      },
      lineHeight: {
        'pdp-title': 'var(--leading-pdp-title)',
        'pdp-body': 'var(--leading-pdp-body)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
        round: 'var(--radius-round)',
        btn: 'var(--radius-sm)',
        card: 'var(--radius-md)',
        elevated: 'var(--radius-md)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      transitionTimingFunction: {
        'ease-drawer': 'var(--ease-drawer)',
      },
    },
  },
  plugins: [],
} satisfies Config
