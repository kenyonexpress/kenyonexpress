/**
 * Parse RevSlider authored attrs (data-text, data-xy, data-dim) from refs/ke_live_home.html.
 * Breakpoints: [1240, 1024, 778, 480] — index 0 = desktop @ 1440px.
 */

export const REV_BREAKPOINTS = [1240, 1024, 778, 480] as const

export function revBreakpointIndex(width = typeof window !== 'undefined' ? window.innerWidth : 1440): number {
  if (width >= REV_BREAKPOINTS[0]) return 0
  if (width >= REV_BREAKPOINTS[1]) return 1
  if (width >= REV_BREAKPOINTS[2]) return 2
  return 3
}

function parseAttrMap(raw: string | null): Record<string, string> {
  if (!raw) return {}
  const map: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) map[k] = v
  }
  return map
}

function pickBp(raw: string | undefined, bp: number): string | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').map((s) => s.trim())
  return parts[bp] ?? parts[0]
}

export type AuthoredTypography = {
  fontSize?: string
  lineHeight?: string
  fontWeight?: string
  letterSpacing?: string
}

export function parseDataText(raw: string | null, bp: number): AuthoredTypography {
  const map = parseAttrMap(raw)
  const ls = pickBp(map.ls, bp) ?? map.ls
  return {
    fontSize: pickBp(map.s, bp) ? `${pickBp(map.s, bp)}px` : undefined,
    lineHeight: pickBp(map.l, bp) ? `${pickBp(map.l, bp)}px` : undefined,
    fontWeight: map.fw,
    letterSpacing: ls && ls !== '0' && ls !== '0px' ? ls : undefined,
  }
}

export type AuthoredPosition = {
  left?: string
  top?: string
}

export function parseDataXy(raw: string | null, bp: number): AuthoredPosition {
  const map = parseAttrMap(raw)
  const xo = pickBp(map.xo, bp)
  const yo = pickBp(map.yo, bp)
  const yMode = pickBp(map.y, bp) ?? 't'

  const pos: AuthoredPosition = {}
  if (xo) pos.left = xo

  if (yo) {
    if (yMode === 'm') {
      pos.top = `calc(50% + ${yo.replace(/^(-?)/, '$1')})`
    } else {
      pos.top = yo
    }
  }

  return pos
}

export type AuthoredDim = {
  width?: string
  height?: string
}

export function parseDataDim(raw: string | null, bp: number): AuthoredDim {
  const map = parseAttrMap(raw)
  const w = pickBp(map.w, bp)
  const h = pickBp(map.h, bp)
  return {
    width: w || undefined,
    height: h || undefined,
  }
}

export { REV_LAYER_TEXT_OVERRIDES as LAYER_TEXT_OVERRIDES } from '@/lib/ke-live-revslider-slides'
