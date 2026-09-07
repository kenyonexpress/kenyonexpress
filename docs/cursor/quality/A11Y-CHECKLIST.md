# A11y checklist (WCAG 2.1 AA)

Per page: skip link, one h1, focus visible, 4.5:1 text (existing contrast tests), 44px targets (touch-targets e2e), `dir=rtl` on html, logical CSS not physical left/right, `lang=he`.

| Page | Extra |
|---|---|
| Home | install prompt a11y; cookie banner at FCP not blocking focus trap forever |
| PDP | alt Hebrew; rating not only color |
| Cart | unavailable reason in text |
| Checkout | latin fields `dir=ltr` (`latin-field-direction`); errors tied to inputs |
| Scan | camera permission copy; outcome not color-only |
| Account | delete phrase not placeholder-only |
| Admin | do not rely on color for money status |

Keyboard: cart qty, pay, scan manual entry. Reduce motion: hero animation swap tests.

This pack does not run axe. Code branch `e2e/a11y.spec.ts`.

---

## Second pass

dir=rtl lang=he. 4.5:1. 44px targets. Checkout errors tied to inputs. Rating not color-only. Skip link + one h1.
