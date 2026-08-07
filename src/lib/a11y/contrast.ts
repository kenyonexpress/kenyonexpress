/**
 * WCAG 2.0 contrast, per the formula in the spec.
 *
 * Pure, no DOM, so the ratios can be asserted in a unit test instead of being
 * eyeballed in a browser. LEG-03 makes ת"י 5568 / WCAG 2.0 AA a launch
 * blocker, and contrast is the one accessibility defect that is fully
 * decidable from the source: it needs no screen reader and no judgement call.
 */

export type Rgb = { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const clean = hex.trim().replace(/^#/, '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`)
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

/** WCAG relative luminance. The 0.03928 branch is the sRGB linearisation. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The AA thresholds.
 *
 * `large` is 18pt (24px), or 14pt (18.66px) when bold. `ui` is WCAG 2.1's rule
 * for the boundary of a control or a meaningful graphic, and it is here
 * because a button whose label is legible but whose edge is invisible still
 * fails for someone who cannot find the button.
 */
export const AA = { normal: 4.5, large: 3, ui: 3 } as const

export type ContrastLevel = keyof typeof AA

export function meetsAA(fg: string, bg: string, level: ContrastLevel = 'normal'): boolean {
  return contrastRatio(fg, bg) >= AA[level]
}

/** Rounded, for a message a human reads. */
export function ratioLabel(fg: string, bg: string): string {
  return `${contrastRatio(fg, bg).toFixed(2)}:1`
}
