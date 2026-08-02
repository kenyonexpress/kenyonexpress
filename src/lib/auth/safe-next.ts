// True if the value contains an ASCII control character (including tab, CR and
// LF) or DEL. Checked by char code rather than a regex so the control
// characters never appear literally in source.
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

// Validates a post-authentication redirect target ("next").
//
// A bare startsWith('/') check is not enough: "//evil.com" is a
// protocol-relative URL and "/\evil.com" is normalized to "//evil.com" by
// browsers, so both navigate off-site despite the leading slash. Anything that
// is not a plain same-site path falls back to the site root.
export function safeNextPath(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''

  if (!value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/'

  // Control characters can be stripped by browsers or split headers, changing
  // the effective target after validation.
  if (hasControlChars(value)) return '/'

  return value
}
