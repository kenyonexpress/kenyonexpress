# Mobile release

Verified 2026-09-02, code and production both.

## What the app is

`apps/mobile` is ONE Expo app (expo-router, Expo 52) serving both sides:
customer (coupons, wallet passes, checkout via WebView) and supplier (login,
PIN, QR scan, history, offline queue with sync). The G10 brief imagined a
supplier-only app with bundle `il.co.kenyonexpress.supplier`; the real app is
combined and ships as `co.il.kenyonexpress.app` on both platforms. The id is
NOT changed here -- an app's bundle id is its identity in both stores, and
renaming a combined app to a supplier-only name would be wrong twice.

## The backend contract is fully live

All four RPCs the app calls exist in production (verified by query, 2026-09-02):
`supplier_app_context`, `verify_supplier_staff_pin` (via
`/api/supplier/app/pin`, rate-limited server-side), `redeem_voucher`,
`log_voucher_scan`. No service_role key ships in the app; everything rides RLS
plus those definer functions.

## Building and shipping (Ofir, or CI with EAS secrets)

```
cd apps/mobile
npx eas login                       # once
npx eas build --profile preview --platform all     # internal testers
npx eas build --profile production --platform all  # store builds
npx eas submit --platform ios       # after the production build
npx eas submit --platform android
```

`eas.json` ships three profiles; production auto-increments the build number
and versions are managed remotely. App Store Connect and Play Console accounts
are owner steps, as are the store listings.

## Not done, and why

- **EAS builds themselves**: need `eas login` (owner credentials). Nothing in
  this repository can or should hold them.
- **Maestro E2E**: needs a built binary or a running simulator; neither exists
  on this machine. The supplier scan flow is covered today by the web e2e
  (`coupon-scan.spec.ts`) against the same RPCs.
- **apps/mobile is not a pnpm workspace member** (no lockfile of its own) --
  dependabot's config documents why. Making it a member is a separate change
  with its own blast radius.
