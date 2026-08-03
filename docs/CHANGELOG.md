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

- (ריק: רשום כאן לפני merge הבא)

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
