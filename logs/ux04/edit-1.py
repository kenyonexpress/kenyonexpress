# -*- coding: utf-8 -*-
# UX04 edit script 1: tokens (ts + css), globals.css, MobileDrawer.tsx, HeroCategorySidebar.tsx.
# Every replacement must match exactly once; anything else aborts before writing.
import io, sys

ROOT = '/Users/ofir/kenyonexpress-autopilot/'
edits = {}

def rep(path, old, new, count=1):
    edits.setdefault(path, []).append((old, new, count))

# ---- tokens.ts --------------------------------------------------------------
rep('src/styles/tokens.ts',
"""    icon: '#515151',
    /** Large empty-state glyphs (empty cart, no results). */
    iconEmpty: '#cccccc',
  },""",
"""    icon: '#515151',
    /** Large empty-state glyphs (empty cart, no results). */
    iconEmpty: '#cccccc',
    /**
     * The off-canvas drawer's own hairlines and type, read off live's
     * `.off-canvas-navigation.light` rules (UX04, 14.10.2026): the panel's
     * inner edge and every row rule are #e3e9ef, and the rows read #4b566b
     * (`!important` on live, so the highlight rows too). Neither is the site
     * border (#ddd) nor the heading (#333e48) the drawer used to borrow.
     */
    drawerBorder: '#e3e9ef',
    drawerText: '#4b566b',
  },""")
rep('src/styles/tokens.ts',
"""    drawer: '#fdfcfc',
""",
"""    drawer: '#fdfcfc',
    /**
     * A drawer row under the pointer: live's `.off-canvas-navigation.light ul
     * li a:hover{background-color:#ebebeb;color:#000}`. Two steps darker than
     * the site's #f5f5f5 row tint, which is what the rows used to borrow.
     */
    drawerHover: '#ebebeb',
""")
rep('src/styles/tokens.ts',
"""  '--color-drawer-bg': SITE.surface.drawer,
""",
"""  '--color-drawer-bg': SITE.surface.drawer,
  '--color-drawer-hover': SITE.surface.drawerHover,
  '--color-drawer-border': SITE.neutral.drawerBorder,
  '--color-drawer-text': SITE.neutral.drawerText,
""")

# ---- tokens.css -------------------------------------------------------------
rep('src/styles/tokens.css',
"""  --color-drawer-bg: #fdfcfc; /* off-canvas drawer paper (live: rgb(253,252,252)) */
""",
"""  --color-drawer-bg: #fdfcfc; /* off-canvas drawer paper (live: rgb(253,252,252)) */
  /* The rest of live's `.off-canvas-navigation.light` (UX04): the panel's
     inner edge and the row rules, the row type, and the row under the
     pointer. Read off refs/ke_live_home.html's stylesheet, not a picture. */
  --color-drawer-border: #e3e9ef; /* `border-left:1px solid #e3e9ef`, `li a{border-color:#e3e9ef}` */
  --color-drawer-text: #4b566b; /* `li a{color:#4b566b!important}` */
  --color-drawer-hover: #ebebeb; /* `li a:hover{background-color:#ebebeb;color:#000}` */
""")
rep('src/styles/tokens.css',
"""  --spacing-drawer-mobile: 280px;
  --spacing-drawer-tablet: 350px;
  --spacing-drawer-row: 50px;
""",
"""  --spacing-drawer-mobile: 280px;
  --spacing-drawer-tablet: 350px;
  --spacing-drawer-row: 50px;
  /* Live's row inset is `padding:0 1.387em` on 14px type = 19.4px (UX04).
     Written in px on purpose: an em lifted from live scales off OUR body,
     which is 16px where live's is 14 (see --text-topbar). The rows were
     `px-gutter` (15), 4.4px tighter than live on both edges. */
  --spacing-drawer-pad: 19.4px;
""")
rep('src/styles/tokens.css',
"""@theme {
  /* --- Brand identity -------------------------------------------------------- */
""",
"""@theme {
  /* --- Motion ---------------------------------------------------------------- */
  /* The off-canvas drawer and its scrim: live's `.off-canvas-navigation
     {transition:all .2s}` and `.off-canvas-bg-opacity .site-content::before
     {transition:all .2s}` name no curve, so both run on the UA default
     `ease`. Tailwind's own default is a different cubic-bezier; this keeps
     the slide on live's curve (UX04). Duration is the built-in `duration-200`. */
  --ease-drawer: ease;

  /* --- Brand identity -------------------------------------------------------- */
""")

# ---- globals.css ------------------------------------------------------------
rep('src/app/globals.css',
"""html {
  scroll-padding-bottom: calc(var(--reserve-consent) + var(--reserve-pwa));
}
""",
"""html {
  scroll-padding-bottom: calc(var(--reserve-consent) + var(--reserve-pwa));
  /* ...and the sticky header at the top (UX04). WCAG 2.4.11 again, the other
     edge: a category link that Tab reaches from below the fold is scrolled to
     the top of the viewport by the browser, which is exactly where the sticky
     header paints, so the focused control was under the header. The strip is
     the header's own height: 49 + 1px border below xl, 109 + 1px from it
     (tokens.css; the top bar above it is not sticky and does not count). */
  scroll-padding-top: calc(var(--spacing-header-handheld) + 1px);
}
@media (min-width: 1280px) {
  html {
    scroll-padding-top: calc(var(--spacing-header-masthead) + 1px);
  }
}

/* The off-canvas drawer's panel (MobileDrawer.tsx). Live's
   `.off-canvas-navigation{scrollbar-width:thin}`; Tailwind has no utility
   for it. Everything else about the panel is a utility on the element. */
.drawer-panel {
  scrollbar-width: thin;
}
""")

# ---- MobileDrawer.tsx -------------------------------------------------------
rep('src/components/layout/MobileDrawer.tsx',
""" * THE HAMBURGER IS 44px OF HIT AREA AROUND A 34x36 PAINT. Live's button is
 * 34x36, which is under the 44px touch floor the brief sets and which WCAG
 * 2.5.5 asks for. Padding the hit area rather than growing the icon keeps the
 * comparison honest -- the pixels match live, the thumb gets a real target.
 */
""",
""" * THE HAMBURGER IS 44px OF HIT AREA AROUND A 34x36 PAINT. Live's button is
 * 34x36, which is under the 44px touch floor the brief sets and which WCAG
 * 2.5.5 asks for. Padding the hit area rather than growing the icon keeps the
 * comparison honest -- the pixels match live, the thumb gets a real target.
 *
 * THE PANEL WAS TRANSPARENT (UX04, 14.10.2026). `bg-drawer` is not a utility
 * this theme generates -- the token is `--color-drawer-bg`, so the class is
 * `bg-drawer-bg` -- and the class silently resolved to nothing. Measured on
 * the built home page at 380 and 768 (logs/ux04/before.json): the open
 * dialog's background-color was rgba(0,0,0,0), and the screenshot shows the
 * category rows drawn straight over the hero and the deals behind the scrim.
 * Nothing in the suite read the colour, so nothing failed.
 *
 * THE REST OF THE DRAWER IS NOW LIVE'S `.off-canvas-navigation.light`, read
 * off refs/ke_live_home.html's stylesheet rather than borrowed from the site
 * palette:
 *
 *   panel    `transition:all .2s` (was 300ms on Tailwind's curve), a 1px
 *            #e3e9ef hairline on the inner edge, `scrollbar-width:thin`
 *   scrim    `rgba(0,0,0,.7)` over 200ms (was 50% over 300ms)
 *   toggle   `.light .navbar-toggler{color:#333e48}`, `:hover{color:#000}`
 *            (was the #515151 icon gray with an opacity fade)
 *   rows     `padding:0 1.387em` = 19.4px (was the 15px gutter), `color:
 *            #4b566b` (was the heading), rules #e3e9ef (were #ddd), hover
 *            `#ebebeb` + `#000` (was the site's #f5f5f5 tint)
 *
 * THE CLOSED SCRIM IS `inert`. It is kept mounted for the fade, at
 * `pointer-events:none` and opacity 0, but it was still a full-viewport
 * <button> in the accessibility tree whose centre hit-tested to the page
 * under it, which is how touch-targets.spec read it as "covered". The panel
 * already takes itself out with `inert` while closed; the scrim does the
 * same now, and hit testing, focus and the tree all agree it is not there.
 */
""")
rep('src/components/layout/MobileDrawer.tsx',
"""        className="grid size-touch-min shrink-0 place-items-center text-icon transition-opacity hover:opacity-70 xl:hidden"
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />""",
"""        className="grid size-touch-min shrink-0 place-items-center text-heading transition-colors hover:text-ink xl:hidden"
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />""")
rep('src/components/layout/MobileDrawer.tsx',
"""      <button
        type="button"
        onClick={close}
        tabIndex={open ? 0 : -1}
        aria-label="סגירת התפריט"
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 motion-reduce:transition-none xl:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />""",
"""      <button
        type="button"
        onClick={close}
        tabIndex={open ? 0 : -1}
        inert={!open}
        aria-label="סגירת התפריט"
        className={`fixed inset-0 z-50 bg-black/70 transition-opacity duration-200 ease-drawer motion-reduce:transition-none xl:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />""")
rep('src/components/layout/MobileDrawer.tsx',
"""        className={`safe-pt safe-pb fixed inset-y-0 right-0 z-50 w-drawer-mobile overflow-y-auto bg-drawer outline-none transition-transform duration-300 motion-reduce:transition-none md:w-drawer-tablet xl:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-drawer-row items-center justify-between border-b border-border px-gutter">
          <h2 id={titleId} className="m-0 text-sm font-bold text-heading">
            {DRAWER_TITLE}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="סגירת התפריט"
            className="-me-2 grid size-touch-min place-items-center text-icon transition-opacity hover:opacity-70"
          >""",
"""        // `border-e`: the panel is anchored to the right, so its inner edge
        // (live's `border-left`) is the inline END in this RTL document.
        className={`drawer-panel safe-pt safe-pb fixed inset-y-0 right-0 z-50 w-drawer-mobile overflow-y-auto border-e border-drawer-border bg-drawer-bg outline-none transition-transform duration-200 ease-drawer motion-reduce:transition-none md:w-drawer-tablet xl:hidden ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-drawer-row items-center justify-between border-b border-drawer-border px-drawer-pad">
          <h2 id={titleId} className="m-0 text-sm font-bold text-heading">
            {DRAWER_TITLE}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="סגירת התפריט"
            className="-me-2 grid size-touch-min place-items-center text-heading transition-colors hover:text-ink"
          >""")
rep('src/components/layout/MobileDrawer.tsx',
"""                  onClick={close}
                  className={`flex h-drawer-row items-center border-b border-border px-gutter text-sm transition-colors hover:bg-surface-hover ${
                    category.highlight ? 'font-bold text-heading' : 'text-heading'
                  }`}
                >""",
"""                  onClick={close}
                  // Live's row, in live's own colours: #4b566b type on a
                  // #e3e9ef rule, #ebebeb + #000 under the pointer or the
                  // keyboard. A highlight row is bold and nothing else.
                  className={`flex h-drawer-row items-center border-b border-drawer-border px-drawer-pad text-sm text-drawer-text transition-colors hover:bg-drawer-hover hover:text-ink focus-visible:bg-drawer-hover focus-visible:text-ink ${
                    category.highlight ? 'font-bold' : ''
                  }`}
                >""")

# ---- HeroCategorySidebar.tsx ------------------------------------------------
rep('src/components/home/HeroCategorySidebar.tsx',
"""        <nav className="min-h-0 flex-1">
""",
"""        {/* Named, because it is a landmark and the landmark list has to tell it
            from the drawer's nav and the footer's (a11y.spec: every navigation
            carries a Hebrew name). The aside is the "קטגוריות" region; the nav
            inside it is the list. UX04. */}
        <nav className="min-h-0 flex-1" aria-label="רשימת הקטגוריות">
""")
rep('src/components/home/HeroCategorySidebar.tsx',
"""                    className="block text-end transition-colors hover:bg-surface-hover hover:font-bold focus:bg-surface-hover focus:font-bold"
""",
"""                    // Live: `li:hover>a, li:focus>a{background-color:#f5f5f5;
                    // font-weight:700}` -- the tint and the weight, on the
                    // pointer and on the keyboard alike. Live names no
                    // transition; the 150ms colour fade is ours, and the
                    // weight snaps as it does there. Measured equal in
                    // logs/ux04/before.json (UX04), so this is pinned, not
                    // changed.
                    className="block text-end transition-colors hover:bg-surface-hover hover:font-bold focus-visible:bg-surface-hover focus-visible:font-bold"
""")

for path, items in edits.items():
    full = ROOT + path
    with io.open(full, encoding='utf-8') as f:
        src = f.read()
    for old, new, count in items:
        n = src.count(old)
        if n != count:
            print(f'ABORT {path}: expected {count} match, found {n} for:\n{old[:120]}')
            sys.exit(1)
        src = src.replace(old, new)
    with io.open(full, 'w', encoding='utf-8') as f:
        f.write(src)
    print('edited', path, len(items))
