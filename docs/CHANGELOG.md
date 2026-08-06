# Changelog

כל השינויים המתועדים למוצר ול-docs מנקודה זו והלאה.  
פורמט מבוסס [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), סעיפים: Added / Changed / Fixed / Removed / Docs.

ההיסטוריה לפני 2026-08-03 חיה ב-git וב-

```
STATE.md
```

(לא מועתקת לכאן רטרואקטיבית).

---

## [Unreleased]

### Docs

### Docs (2026-08-07 QA verify חבילת 20)

- `ARCHITECTURE-CUSTOMER-SUPPORT.md`: S7 No Escrow מפורש
- קישור הדדי PRICING ↔ SUPPORT
- `MASTER-INDEX.md`: סטטוס #12/#13 מעודכן אחרי סריקה חוזרת

### Docs (2026-08-07 QA re-pass חבילת 20)

- `CONTRADICTIONS.md`: C11ב Escrow בוטל; C11א / No Escrow מחייב
- קישורים הדדיים ל-`CONTRADICTIONS.md` בכל 20 המסמכים
- en-dash הוחלף; `MASTER-INDEX.md` סטטוס QA-PASS מעודכן לכל #1 עד 20

### Docs (2026-08-06 QA pass חבילת 20)

- QA על כל 20 מסמכי ROADMAP-V2: No Escrow + `platform_percent`, קישורים הדדיים, RTL
- `MASTER-INDEX.md`: טבלת סטטוס QA-PASS לכל #1 עד 20
- `ARCHITECTURE-PERSONAL-AREA.md`: P7 מיושר ל-No Escrow (מחוץ לחבילה)

### Docs (2026-08-06 docs 16–20)

- `ARCHITECTURE-GIFT-COUPONS.md` (`df22194`)
- `ARCHITECTURE-B2B-SALES.md` (`bfb9319`)
- `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` (`d808c6c`)
- `ARCHITECTURE-DATA-EXPORT-GDPR.md` (`84df64a`)
- `MASTER-INDEX.md` (`1e5b291`)

### Docs (2026-08-06 docs 11–15)

- `ARCHITECTURE-CATEGORIES-TAXONOMY.md` (`e34f6a3`)
- `ARCHITECTURE-PRICING-RULES.md` (`9364c80`)
- `ARCHITECTURE-CUSTOMER-SUPPORT.md` (`61ba9fd`)
- `ARCHITECTURE-BACKUP-DR.md` (`345522d`)
- `ARCHITECTURE-APP-STORE-LAUNCH.md` (`e71e3ac`)

### Docs (2026-08-06 10-doc)

- `ARCHITECTURE-SUPPLIER-ONBOARDING.md` (`ee34dc3`)
- `ARCHITECTURE-ANALYTICS.md` (`48f2be4`)
- `ARCHITECTURE-LEGAL-COMPLIANCE.md` (`a99adfe`)
- `ARCHITECTURE-SEARCH-UX.md` (`625bc27`)
- `RUNBOOK-PRODUCTION.md` (`f975d2e`)
- `ARCHITECTURE-EMAIL-TEMPLATES.md` (`2bf1b2b`)
- `ARCHITECTURE-INVENTORY.md` (`6f7467d`)
- `ARCHITECTURE-REFERRAL.md` (`77ced4f`)
- `ARCHITECTURE-OBSERVABILITY.md` (`8b86e57`)
- `ROADMAP-V2.md` (`fa7889f`)

### Docs (10-doc Hebrew RTL)

- `ARCHITECTURE-NOTIFICATIONS.md` (`9a4b4c6`)
- `ARCHITECTURE-ADMIN-DASHBOARD.md` (`f7c0b45`)
- `ARCHITECTURE-FRAUD-PREVENTION.md` (`03685e1`)
- `ARCHITECTURE-CASHBACK-WALLET.md` (`e24e60a`)
- `ARCHITECTURE-SUPPLIER-ONBOARDING.md` (`24baec5`)
- `ARCHITECTURE-ANALYTICS.md` (`2a96670`)
- `ARCHITECTURE-LEGAL-COMPLIANCE.md` (`88a05b3`)
- `ARCHITECTURE-SEARCH-UX.md` (`e4f7924`)
- `RUNBOOK-PRODUCTION.md` (`16b7f66`)
- `ROADMAP-V2.md` (`f9daa4b`)


### Docs (pack-20)

- `ARCHITECTURE-NOTIFICATIONS.md` (`b099c4f`)
- `ARCHITECTURE-SEO-PERFORMANCE.md` (`544e522`)
- `ARCHITECTURE-MOBILE-APP.md` (`2ae544d`)
- `ARCHITECTURE-ADMIN-DASHBOARD.md` (`2805eb0`)
- `ARCHITECTURE-FRAUD-PREVENTION.md` (`5fbda92`)
- `RUNBOOK-PRODUCTION.md` (`87f622d`)
- `ARCHITECTURE-ANALYTICS.md` (`c5c68d5`)
- `ARCHITECTURE-CASHBACK-WALLET.md` (`284ba76`)
- `ARCHITECTURE-SEARCH-UX.md` (`fb25cbd`)
- `ARCHITECTURE-REFERRAL.md` (`38147a3`)
- `ARCHITECTURE-CATEGORIES-TAXONOMY.md` (`313c17c`)
- `ARCHITECTURE-EMAIL-TEMPLATES.md` (`a0566f8`)
- `ARCHITECTURE-SUPPLIER-ONBOARDING.md` (`b3ca26c`)
- `ARCHITECTURE-INVENTORY.md` (`1c15687`)
- `ARCHITECTURE-PRICING-RULES.md` (`bf5e8c3`)
- `ARCHITECTURE-CUSTOMER-SUPPORT.md` (`f6f0d93`)
- `ARCHITECTURE-LEGAL-COMPLIANCE.md` (`2f5ff17`)
- `ARCHITECTURE-BACKUP-DR.md` (`ca9dbcf`)
- `ARCHITECTURE-OBSERVABILITY.md` (`1037986`)
- `ROADMAP-V2.md` (`c1a36b7`)

### Docs (rev C pack)

- ARCHITECTURE-NOTIFICATIONS.md: Wallet push + email/WA/SMS lifecycle (`4eaf815`)
- ARCHITECTURE-SEO-PERFORMANCE.md: ISR/sitemap/schema/CWV (`b277760`)
- ARCHITECTURE-MOBILE-APP.md: Expo vs PWA, No Escrow (`85a7807`)
- ARCHITECTURE-ADMIN-DASHBOARD.md: platform_percent / suppliers / reports (`7056f6b`)
- ARCHITECTURE-FRAUD-PREVENTION.md: double-redeem / chargebacks / QR screenshots (`81976bd`)
- RUNBOOK-PRODUCTION.md: deploy/rollback/migrations (`c27ee32`)


---

## [2026-08-03] - arch/docs-lifecycle (ke-arch docs pack)

Worktree:

```
/Users/ofir/kenyonexpress-web/ke-arch
```

Branch:

```
arch/docs-lifecycle
```

### Docs

#### Added

- `docs/ARCHITECTURE-SECURITY-RLS.md`: מטריצת RLS ל-44 טבלאות (`anon` / `authenticated` / `supplier` / `admin` / `service_role`) פר פעולה
- `docs/ARCHITECTURE-SEARCH.md`: חיפוש Postgres FTS, פילטרים, אינדוקס Meili, QStash, DLQ
- `docs/ARCHITECTURE-WALLET-LEDGER.md`: ארנק קאשבק פנימי, כפול-רישום באגורות, בלי משיכה החוצה
- `docs/ARCHITECTURE-ANALYTICS.md`: סכימת אירועים בלי PII
- `docs/ARCHITECTURE-PWA.md`: manifest, Serwist SW, push
- `docs/TEST-STRATEGY.md`: פירמידת טסטים מלאה
- `docs/CHANGELOG.md`: התחלה מנקודה זו

#### Changed

- `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`: נעילת מודל **No Escrow** (קופון באתר נשאר בפלטפורמה; יתרה בבית העסק)
- `docs/ARCHITECTURE-NOTIFICATIONS.md`: Resend + Edge Functions, תבניות RTL, בלי נוסח Escrow
- `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`: `platform_percent` דינמי פר מוצר; דוחות בלי held
- `docs/RUNBOOK-PRODUCTION.md`: deploy / rollback / migrations + smoke No Escrow

### Money model note (docs binding)

- קופון: אין Escrow / held-until-redeem; תשלום באתר נשאר בפלטפורמה; יתרה נגבית בעסק
- פיזי: פיצול לפי `platform_percent` מצולם ב-`order_items`
- אין אחוז עמלה קבוע גלובלי

### Commits (docs-lifecycle, ייחוס)

| SHA | מסמך |
|---|---|
| `904ae34` | ARCHITECTURE-SUPPLIER-PORTAL |
| `bc30683` | ARCHITECTURE-NOTIFICATIONS |
| `f746f34` | ARCHITECTURE-ADMIN-DASHBOARD |
| `a702656` | RUNBOOK-PRODUCTION |
| `bb241cc` | ARCHITECTURE-SECURITY-RLS |
| `0d1fd47` | ARCHITECTURE-SEARCH |
| `847a45a` | ARCHITECTURE-WALLET-LEDGER |
| `6bb9455` | ARCHITECTURE-ANALYTICS |
| `af7a6d8` | ARCHITECTURE-PWA |
| `d68d81c` | TEST-STRATEGY |
| `8a97594` | CHANGELOG |

---

## איך לעדכן

1. כל PR משמעותי מוסיף בולטים תחת `[Unreleased]`.
2. בשיגור / תיוג: מעבירים את הבולטים לתאריך חדש `## [YYYY-MM-DD]`.
3. Docs-only ב-`ke-arch`: רשום תחת `### Docs`.
4. אין em dash במסמך הזה.
