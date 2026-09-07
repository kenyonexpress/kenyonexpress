# Hebrew QA

- Source locale `he-IL`, Heebo, `dir=rtl`.
- Reject: נאמנות, escrow, עמלה 10% כברירת מחדל, English marketing on home (defect history).
- Coupon: מחיר קופון absolute, not אחוז מהערך הנקוב.
- Gender: existing `נסה`; do not mix `נסה/י` on one page unless the whole shop switches.
- Bidi: ₪ after digits for `under-99` (171); `latin-field-direction` for emails/phones.
- Errors from `docs/ERROR-COPY.md` / action Hebrew, not raw `error.message` (log-coverage).
- Till outcomes Hebrew from server.
- Legal 14-day, fee 5% or ₪100.
- Do not machine-translate legal for `/en` (W10 off).

RTL pitfalls: `space-between` mirroring, sticky header height, `left`/`right` vs `ps`/`pe`, Electro refs vs live Elementor (`LIVE-DELTA.md`).

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
