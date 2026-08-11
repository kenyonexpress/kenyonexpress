# ARCHITECTURE-DESIGN-SYSTEM.md

ארכיטקטורת **שפת עיצוב / Design tokens** ל-KenyonExpress (Electro-aligned).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: refs/, account.css, cart-page.css, SEO-PERFORMANCE, a11y.

---

## 0. עקרונות

1. מותג ראשון ב-viewport שיווקי; לא דשבורד גנרי.
2. RTL + Heebo בלבד ל-UI עברי.
3. צהוב מותג `#fed700` ל-CTA ראשי; ink `#333e48`.
4. מדידות מ-`refs/` + CSS חי גוברות על "טעם AI".
5. אין ערכות סגול-על-לבן / קרם-טרקוטה כברירת מחדל.

---

## 1. Tokens

```css
:root {
  --color-brand: #fed700;
  --color-ink: #333e48;
  --color-muted: #768b9e;
  --color-line: #e4e4e4;
  --color-link: #0062bd;
  --color-danger: #e4002b;
  --color-success: #44b81b;
  --font-heebo: /* next/font */;
  --container: 1320px; /* storefront; cart often ~1170 */
}
```

---

## 2. טיפוגרפיה

| שימוש | גודל משוער |
|---|---|
| H1 עגלה/חשבון | ~40px / 500 |
| גוף | 14–16px |
| Meta | 13px muted |

---

## 3. רכיבים

| רכיב | כלל |
|---|---|
| Primary button | bg brand, text ink |
| Cards | גבול line, רדיוס קטן; לא ב-hero |
| Chips | ok/warn/dead |
| Forms | labels מימין, שגיאה אדומה |

---

## 4. Motion

2–3 תנועות מכוונות במשטחים שיווקיים (hero fade, add-to-cart feedback). בלי רעש.

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Design system tokens (`arch/docs-queue`) |
