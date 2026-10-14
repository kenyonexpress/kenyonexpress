# -*- coding: utf-8 -*-
# UX04 edit script 3: docs/COMPONENT-QUEUE.md row and STATE.md.
import io, sys

ROOT = '/Users/ofir/kenyonexpress-autopilot/'

QUEUE_ROW = (
"| 2026-10-14 | 03 + 11 Departments menu and off-canvas drawer (UX04 polish) | measured, not eyeballed, against refs/ke_live_home.html's stylesheet and logs/ux04/before.json. "
"THE DRAWER WAS TRANSPARENT: `bg-drawer` is not a utility this theme generates (the token is `--color-drawer-bg`), so the open panel measured background-color rgba(0,0,0,0) at 380 and 768 and the category rows painted over the hero and the deals behind the scrim; now `bg-drawer-bg` (rgb(253,252,252), live's paper). "
"The rest of live's `.off-canvas-navigation.light`: 1px #e3e9ef hairline on the inner edge (`border-e`, the inline end in RTL), `transition:all .2s` on the UA `ease` curve for the panel and the scrim (were 300ms on Tailwind's curve; `--ease-drawer`), scrim rgba(0,0,0,.7) (was 50%), `scrollbar-width:thin`; the toggle and the X are `.light .navbar-toggler{color:#333e48}` hovering to #000 (were #515151 with an opacity fade); the rows are `padding:0 1.387em` of 14px = 19.4px (`--spacing-drawer-pad`, were the 15px gutter), `color:#4b566b` (`--color-drawer-text`, were the heading), rules #e3e9ef (`--color-drawer-border`, were #ddd), hover #ebebeb + #000 (`--color-drawer-hover`, were the site's #f5f5f5 tint). "
"The closed scrim is `inert`: a full-viewport button at opacity 0 was still in the tree and hit-tested to the page under it, which is how touch-targets.spec read `button[סגירת התפריט]` as covered. "
"The hero panel: its nav is a named landmark (`רשימת הקטגוריות`, a11y.spec's nameless-landmark finding), its row hover/focus is live's `li:hover>a{background:#f5f5f5;font-weight:700}` and measured equal before and after, so it is pinned and not changed; `html{scroll-padding-top}` is the sticky header's height (50 / 110) so a row that Tab reaches from below the fold is not scrolled under the header (2.4.11). "
"No mega panel, as the 03 note already measured: live's eleven departments carry `dis-sub` and no `menu-item-has-children`, so there is no hover reveal to build and nothing to source it from. "
"Pinned by `menu-drawer-polish-gate.test.ts`, `MobileDrawer.test.tsx`, `HeroCategorySidebar.test.tsx` and `e2e/menu-drawer.spec.ts` (30/30 on chromium + mobile-chrome against `pnpm start`; hover assertions are desktop-only because Tailwind gates `hover:` behind `(hover: hover)`) | 2.22 / 1.25 / 1.16 (frozen captures; unchanged, the drawer is closed and hover is not in a capture) |\n"
)

STATE_HEAD = (
"Updated: 2026-10-14 11:35 (UX04 ליטוש תפריט הקטגוריות והמגירה הניידת: **המגירה הייתה שקופה**: ‏`bg-drawer` אינו ‏utility שהערכה מייצרת (הטוקן הוא ‏`--color-drawer-bg`), ולכן ה-dialog הפתוח נמדד ‏`rgba(0,0,0,0)` ב-380 וב-768 ושורות הקטגוריות צוירו ישר על ה-hero ועל הדילים שמאחורי המסך; עכשיו ‏`bg-drawer-bg` (‏rgb(253,252,252) של החי). שאר ‏`.off-canvas-navigation.light` של החי: קו ‏1px ‏#e3e9ef בקצה הפנימי, ‏`transition:all .2s` על עקומת ‏`ease` לפאנל ולמסך (היו ‏300ms על העקומה של ‏Tailwind), מסך ‏rgba(0,0,0,.7) (היה ‏50%), ‏scrollbar דק; ההמבורגר וה-X ‏#333e48 עם ‏hover ל-#000 (היו ‏#515151 עם שקיפות); השורות ‏19.4px פנימה (‏1.387em של ‏14px, היו ‏15), ‏#4b566b על קווי ‏#e3e9ef, ‏hover ‏#ebebeb ‏+ ‏#000. המסך הסגור ‏`inert` (הממצא \"covered\" של ‏touch-targets). הפאנל הצהוב: ה-nav קיבל שם (‏`רשימת הקטגוריות`), ‏hover של שורה נמדד שווה לחי ונעוץ, ו-`scroll-padding-top` בגובה הכותרת הדביקה (‏50 / 110). אין מגה-פאנל: לחי אין תתי-קטגוריות (‏`dis-sub` על כל ‏11). שער ‏home ‏2.22 / 1.25 / 1.16, ללא שינוי. הרשומה המלאה למטה.)\n"
"קודם: "
)

STATE_PARA = (
"**החלטות שהתקבלו לבד (UX04, 11:35):** (1) **נמדד לפני שנכתב, מול ה-CSS של החי**: כל ערך נקרא מ-`refs/ke_live_home.html` ב-checkout הראשי (‏`.off-canvas-navigation{right:-280px;width:280px;transition:all .2s;scrollbar-width:thin}`, ‏`@media(min-width:768px){width:350px}`, ‏`.light{background-color:#fdfcfc;border-left:1px solid #e3e9ef}`, ‏`.light ul li a{color:#4b566b!important;border-color:#e3e9ef}`, ‏`ul li a{padding:0 1.387em;line-height:3.5em}`, ‏`.light ul li a:hover{background-color:#ebebeb;color:#000!important}`, ‏`.off-canvas-bg-opacity .site-content::before{background:rgba(0,0,0,.7);transition:all .2s}`, ‏`.handheld-header-v2.light .off-canvas-navigation-wrapper .navbar-toggler{color:#333e48}` ‏+ ‏`:hover{color:#000}`, ‏`.departments-menu-v2-title+.dropdown-menu>li:hover>a{background-color:#f5f5f5;font-weight:700}`), והמצב-לפני נמדד בדפדפן מול ה-build של ‏HEAD ב-`logs/ux04/before.json` ‏+ ‏`before-drawer-380.png` (‏`probe.mjs`, שלושת הרוחבים). (2) **המגירה הייתה שקופה וזה הממצא העיקרי**: ‏`bg-drawer` לא תואם שום טוקן (‏`--color-drawer-bg` מייצר ‏`bg-drawer-bg`), והמחלקה נפתרה לכלום בשקט; אף טסט לא קרא את הצבע, ולכן שום דבר לא נפל. הצילום מראה את שורות הקטגוריות על ה-hero. תוקן בשם הקיים ולא בשינוי שם הטוקן (פחות קבצים, ‏SITE_CSS_VARS לא זז). (3) **ארבעה טוקנים חדשים ולא ערכים גולמיים**: ‏`--color-drawer-border` ‏#e3e9ef, ‏`--color-drawer-text` ‏#4b566b, ‏`--color-drawer-hover` ‏#ebebeb ב-`tokens.ts` ‏+ ‏`tokens.css` (‏`tokens.test.ts` מצמיד את שניהם), ‏`--spacing-drawer-pad: 19.4px` (‏px ולא ‏em: ‏em מהחי מתרחב מגוף ‏16 שלנו, הלקח של ‏UX02), ו-`--ease-drawer: ease` כי ‏`transition:all .2s` של החי לא נוקב עקומה וברירת המחדל של ‏Tailwind היא ‏cubic-bezier אחרת. ‏`hover:text-ink` משתמש ב-`--color-ink` (‏#000) הקיים. (4) **‏`border-e` ולא ‏`border-s`**: ‏`border-left` של החי הוא הקצה הפנימי של פאנל מעוגן ימינה, וב-RTL זה ‏inline-end; נמדד ‏`border-left-width:1px` אחרי. (5) **המסך הסגור ‏`inert`** במקום ‏`aria-hidden` או ‏unmount: הוא נשאר ב-DOM בשביל ה-fade, ‏inert מוציא אותו מהעץ, מהפוקוס ומה-hit test בבת אחת (אותו מנגנון של הפאנל מ-STEP 32); ‏`before.json` הראה ‏`hitSelf:false` עם ‏`a.p_con__category` מתחתיו, ‏`after.json` מראה ‏`inert:true`. (6) **ה-X נשאר בתוך הפאנל**: החי מחליף את ההמבורגר ב-X באותו מקום בכותרת (‏`.toggled .navbar-toggle-close{display:block}`), אבל הפאנל של ‏280 מכסה ‏x100..380 וההמבורגר יושב ב-x319, כך שה-X של החי מוסתר מתחת למגירה שלו; שורת הכותרת של הפאנל עם ‏X של ‏44 היא ההסתגלות המדודה, ועכשיו גם היא על קו ‏#e3e9ef וב-19.4px. (7) **אין מגה-פאנל ואין ‏hover reveal**: ההערה על ‏03 ב-`COMPONENT-QUEUE.md` כבר מדדה (‏11 פריטים, ‏`dis-sub` על כולם, ‏0 ‏`menu-item-has-children`), ואומת שוב מול ה-markup של ‏`#menu-all-departments-menu-2`; כלל ‏`.departments-menu-v2 .dropdown-submenu .dropdown-menu{transition:all .34s}` של ‏Electro קיים ב-CSS בלי אף ‏markup שמפעיל אותו. בדף הבית הרשימה ‏`show-dropdown` תמיד פתוחה, ולדפים אחרים אין פאנל צהוב בחי (הכותרת היא ‏Elementor, ‏`LIVE-DELTA.md`). ‏hover של שורה (‏#f5f5f5 ‏+ ‏700) נמדד שווה לחי לפני ואחרי, ולכן נעוץ בטסט ולא שונה; ‏`focus:` הפך ל-`focus-visible:` כדי שלחיצת עכבר לא תשאיר שורה מודגשת. (8) **‏`scroll-padding-top`** בגובה הכותרת הדביקה (‏`--spacing-header-handheld`+1 / ‏`--spacing-header-masthead`+1 מ-xl, ה-TopBar אינו דביק ולא נספר): ‏2.4.11 בקצה העליון, אותו מנגנון של ‏`scroll-padding-bottom` לבאנר ההסכמה; ה-e2e מחנה שורה ‏30px מראש החלון, ממקד, ומודד ‏y>=110 ו-hit test לעצמה. (9) **‏hover לא נבדק על ‏Pixel 5**: ‏Tailwind v4 עוטף כל ‏`hover:` ב-`@media (hover:hover)`, אז על מכשיר מגע צבע המנוחה נשאר (כמו שנמדד ב-UX03); ‏8 ‏assertions נפלו בריצה הראשונה בדיוק מזה ו-`hoverApplies()` מדלג על חצי ה-hover בלבד, הגיאומטריה והצבעים במנוחה נבדקים בשני הפרויקטים. ‏`responsive.test.ts` תפס שסדר המחלקות של הפאנל חייב להתחיל ב-`safe-pt safe-pb fixed inset-y-0`; ‏`drawer-panel` עבר לסוף. (10) ‏`logs/ux04/` נכנס ל-commit כמו ‏`logs/ux03/` (‏probe, ‏before/after, צילומים, לוגים). ‏Supabase MCP ו-GitHub MCP לא מאומתים בסשן; לא נדרש ‏DB ולא ‏PR. השרת הזר על ‏3311 (‏PID ‏68686) לא נגעו בו; השרת שלי על ‏3345 נעצר בסוף. שערים: ‏`pnpm test` ‏820 קבצים ירוקים (‏9606 ‏+ ‏12 skipped, הסוויטה המלאה, אחרי תיקון סדר המחלקות); ‏`type-check` נקי; ‏`pnpm lint` ירוק על כל הריפו (‏2348 קבצים, ארבעת השערים); ‏`pnpm build` ירוק, ‏CSP shell gate נקי (‏275 shells); ‏Playwright ‏`menu-drawer.spec.ts` ‏30/30 (‏chromium ‏+ ‏mobile-chrome); שער ‏home ‏2.22 / 1.25 / 1.16 (ללא שינוי, המגירה סגורה בצילום). גיבוי יומי קיים מ-04:47 (שלושה אחרונים), ‏caffeinate חי. **המשך מ: ה-goal הבא בתור ‏/goal.**\n\n"
)

def main():
    q = ROOT + 'docs/COMPONENT-QUEUE.md'
    s = io.open(q, encoding='utf-8').read()
    anchor = "| 2026-10-14 | 02 Masthead (UX03 polish) |"
    i = s.find(anchor)
    assert i >= 0
    j = s.find('\n', i) + 1
    s = s[:j] + QUEUE_ROW + s[j:]
    io.open(q, 'w', encoding='utf-8').write(s)
    print('queue row added')

    st = ROOT + 'STATE.md'
    s = io.open(st, encoding='utf-8').read()
    old = "Updated: 2026-10-14 10:50 (UX03"
    assert s.count(old) == 1
    s = s.replace(old, STATE_HEAD + "2026-10-14 10:50 (UX03", 1)
    anchor2 = "**החלטות שהתקבלו לבד (UX03, 10:50):**"
    assert s.count(anchor2) == 1
    s = s.replace(anchor2, STATE_PARA + anchor2, 1)
    io.open(st, 'w', encoding='utf-8').write(s)
    print('STATE.md updated')

main()
