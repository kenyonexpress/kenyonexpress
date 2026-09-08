# MOBILE-APP-SPEC

`apps/mobile` is one Expo app (expo-router) for **customers and suppliers**.
Bundle id on both stores: `co.il.kenyonexpress.app`. It is not a supplier-only
binary. Version in `app.json`: 0.2.0. RTL is forced in the root layout
(`I18nManager.forceRTL`); the first launch after install may still paint LTR
on Android until the next process start.

This document is the supplier scanner. Customer surfaces (coupons, wallet
pass, checkout WebView) share the same binary and the same session.

Companion: `docs/MOBILE-RELEASE.md`.

---

## 1. Requirements

The till must:

1. Identify a staff member with a PIN (not a second login).
2. Read a QR or a typed code.
3. Send that string to the server. The app never decides that a voucher is
   valid.
4. Show the server's verdict in Hebrew.
5. List today's scans, separately from scans still waiting on the network.
6. Survive a dead radio without pretending a sale went through.

Enforcement is RLS plus `redeem_voucher`. The UI is a courtesy. A caller who
is not in `supplier_members` is refused in the database whatever the screen
drew.

No `service_role` key ships in the app.

---

## 2. Screens

### Login (supplier home)

Route: `apps/mobile/app/supplier/index.tsx`.

Three refusals, three messages:

| State | Title | What to do |
|---|---|---|
| not a member | `אין הרשאת ספק` | owner adds the user under `/admin/suppliers` |
| scanning off | `סריקה באפליקציה כבויה` | use the website till, or enable scanning for that supplier |
| ok | supplier name | links to scan and to today's list |

Pending offline count is shown here so a cashier opening the app after a
blackout sees work waiting.

Customer login is the same Supabase session as the website (Google / email).
Supplier rights come from `supplier_members`, not from `profiles.role`.

### Scan QR

Route: `apps/mobile/app/supplier/scan.tsx`.

`CameraView` from `expo-camera`. One-shot lock (`busy`): a camera fires the
same code many times a second while it stays in frame. Without the lock the
cashier would see green then red (`already_redeemed`) on a still voucher.

The app does not parse the QR and does not check the signature. It posts the
string.

### Manual code entry

Same screen, text field plus submit. Same `submitScan` path, `scanMethod:
'manual'`. Staff id from the PIN step is attribution only; it grants nothing.

### Redemption confirmation

Not a separate route. A `verdict` overlay on the scan screen:

| Tone | Meaning |
|---|---|
| ok | server said success |
| bad | server said already used, expired, wrong supplier, etc. |
| wait | queued because there is no network. **The voucher is not burned.** |

Copy for offline: `אין רשת. השובר טרם מומש, והסריקה תישלח כשהחיבור יחזור.`

Settles after about 2.2 seconds so the next customer can be scanned.

### Daily redemption list

Route: `apps/mobile/app/supplier/history.tsx`.

Two lists, never merged:

1. Settled: `voucher_redemptions` for today, including refusals (expired
   attempts are part of the day).
2. Pending: local queue. Labelled as waiting. A greyed "almost redeemed" row
   is how a cashier believes a sale happened.

Hebrew outcome labels: מומש, כבר מומש, פג תוקף, בוטל, הוחזר, לא נמצא, שובר של
עסק אחר, and the rest of `voucher_scan_outcome`.

---

## 3. Offline behaviour

The brief "must be online" is the **web** `/scan` page. The app **does**
queue.

`apps/mobile/src/lib/supplier/queue.ts`:

- FIFO in AsyncStorage (`ke.supplier.scan_queue.v1`), not SecureStore (a day's
  list does not fit a 2 KB Keychain slot).
- Each item mints `idempotencyKey` at scan time. `redeem_voucher` keys on it,
  so drain-twice, two devices, or a kill mid-request still burns once.
- Drain on mount and after every successful online scan.
- Sign-out clears the queue.
- Corrupt storage: empty the queue rather than brick the till.

The voucher is redeemed when the server answers success, not when the camera
beeps.

---

## 4. Camera permissions

iOS `NSCameraUsageDescription` and the Expo Camera plugin:

`המצלמה משמשת לסריקת קודי QR של שוברים בעמדת הקופה.`

Android: `CAMERA`, `VIBRATE`.

Flow: `useCameraPermissions`. If denied, the scan screen stays on manual
entry; it does not crash. Do not ask for camera on the customer home screen.

---

## 5. Session handling

Supabase session in Expo SecureStore. Refresh on `TOKEN_REFRESHED`. Staff PIN
is a separate, short-lived identification of who is at the till
(`POST /api/supplier/app/pin`, body `{ pin: 4 to 8 digits }`, 15 attempts /
hour / staff). PIN is not a login and does not mint a JWT.

On sign-out: clear session, clear scan queue, stop using the push token.

---

## 6. RLS role enforcement

| Check | Where |
|---|---|
| Is this user a supplier member? | `supplier_app_context()` |
| May they burn a code? | `redeem_voucher` derives supplier from `auth.uid()` via `supplier_members`. Supplier id in the request is ignored |
| What may they read on history? | `voucher_redemptions` supplier policy; a voucher is readable after redeem, not before |

Roles on the member row: `owner`, `manager`, `scanner`. Scanner is enough to
scan. Admin website roles (`content_uploader`, `support`) do not open the
till.

---

## 7. Push notification plan

Registration **after** sign-in, never on first launch. iOS will not re-ask.

Token stored in `push_tokens`. Android channel id `default` must match the
server or Android silences the push.

Pushable kinds (server): `voucher_issued`, `voucher_expiring`,
`cashback_credited`. Supplier till alerts for `supplier_sale` /
`voucher_redeemed` are email-first today; do not assume a till push exists
until a kind is wired to this app.

Foreground: show the banner (`setNotificationHandler`). Cold start: read the
notification that launched the app; the live listener does not see it.

Simulator: no token. Guard with `Device.isDevice`.

---

## 8. App Store metadata (Hebrew)

| Field | Value |
|---|---|
| Name | KenyonExpress |
| Subtitle (iOS, propose) | קופונים ומימוש בקופה |
| Description (propose) | קופונים ומבצעים מעסקים בישראל. לקוחות: הקופונים שלי, ארנק, תשלום. בתי עסק: סריקת QR בקופה, הזנה ידנית, רשימת היום. |
| Camera purpose | as shipped in `app.json` |
| Privacy | no PAN, no location required for scan, session on device |
| Category | Shopping |
| Screenshots | RTL, Hebrew UI, scan verdict in green/red |

Store listings and EAS login are owner steps. `eas.json` has preview and
production profiles. Production auto-increments the build number.

Keywords: קופון, דיל, שובר, קופה, QR. Do not promise "offline redemption" in
the store text. Promise "the scan waits for a connection, then it is burned
once."
