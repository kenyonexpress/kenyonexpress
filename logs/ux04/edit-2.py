# -*- coding: utf-8 -*-
# UX04 edit script 2: extend MobileDrawer.test.tsx and HeroCategorySidebar.test.tsx.
import io, sys

ROOT = '/Users/ofir/kenyonexpress-autopilot/'
edits = {}

def rep(path, old, new, count=1):
    edits.setdefault(path, []).append((old, new, count))

rep('src/components/layout/MobileDrawer.test.tsx',
"""  it('drops inert and moves focus into the panel when opened', () => {
    const { dialog } = open()
    expect(dialog.hasAttribute('inert')).toBe(false)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
""",
"""  it('drops inert and moves focus into the panel when opened', () => {
    const { dialog } = open()
    expect(dialog.hasAttribute('inert')).toBe(false)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  // UX04. The scrim is kept mounted at opacity 0 for the fade, and was still
  // a full-viewport <button> in the tree and in the hit test while closed
  // (touch-targets.spec read it as "covered"). It is inert exactly when the
  // panel is, and live again the moment the drawer opens.
  it('parks the scrim with inert while closed and frees it when open', () => {
    render(<MobileDrawer />)
    const scrimOf = () =>
      screen
        .getAllByRole('button', { name: 'סגירת התפריט', hidden: true })
        .find((b) => b.className.includes('fixed')) as HTMLElement
    expect(scrimOf().hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'תפריט קטגוריות' }))
    expect(scrimOf().hasAttribute('inert')).toBe(false)
    fireEvent.click(scrimOf())
    expect(scrimOf().hasAttribute('inert')).toBe(true)
  })
""")

rep('src/components/home/HeroCategorySidebar.test.tsx',
"""  it('keeps the 34.66px row: 6.5px padding around a 14px/1.5 line', () => {
""",
"""  // UX04: the list is a navigation landmark, and the landmark list has to
  // tell it from the drawer's nav and the footer's (a11y.spec).
  it('names its nav landmark in Hebrew', () => {
    const nav = html.match(/<nav[^>]*>/)?.[0] ?? ''
    expect(nav).toMatch(/aria-label="[^"]*\\p{Script=Hebrew}[^"]*"/u)
  })

  it('keeps the 34.66px row: 6.5px padding around a 14px/1.5 line', () => {
""")

for path, items in edits.items():
    full = ROOT + path
    with io.open(full, encoding='utf-8') as f:
        src = f.read()
    for old, new, count in items:
        n = src.count(old)
        if n != count:
            print(f'ABORT {path}: expected {count} match, found {n} for:\\n{old[:120]}')
            sys.exit(1)
        src = src.replace(old, new)
    with io.open(full, 'w', encoding='utf-8') as f:
        f.write(src)
    print('edited', path, len(items))
