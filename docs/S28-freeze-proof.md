# S28: freeze proof against design-locked-2026-10-19

Queue S28, 05.11.2026. Branch closeout/v1-final.

## Verdict

**The frozen design is untouched.** Home, header, top bar, hero, category
menu, footer, category page, product page, `src/app/globals.css`,
`src/app/layout.tsx` and the home page show **zero** diff against the tag.
The gate command names src/app/page.tsx, which does not exist and did not
exist at the tag: the home page is `src/app/(store)/page.tsx`, so a diff of
the literal path is empty for the wrong reason. The real files were checked
separately (last block below): `src/app/(store)/page.tsx`,
`src/app/(store)/layout.tsx`, `src/app/(store)/category`,
`src/app/(store)/product` and `src/app/(main)/layout.tsx` show no change.
Likewise there is no tailwind config file in the repo now, and there was none at the tag
either (Tailwind v4, configured in CSS).

The literal S28 command, which takes all of `src/components`, lists 23 files.
10 of them are new. The other **13 existing files did change**. Every one of
them was changed by a V item (V01 to V08), and every one renders only on a
route that the 04.11 FREEZE SCOPE AMENDMENT opened for visual completion. That
amendment says "The S28 freeze gate applies to the FROZEN list only", so none
of the 13 was restored. Restoring them would undo the owner-approved V work on
cart, account and supplier apply. Because nothing was restored, S27 does not
need to run again: its five green journeys ran on this same tree.

| Modified file | Where it renders | Open scope |
|---|---|---|
| `src/components/cart/CartCouponForm.tsx`, `src/components/cart/CartLineItem.tsx`, `src/components/cart/CartPageView.tsx`, `src/components/cart/CartTotalsSidebar.tsx` | /cart | cart drawer + /cart |
| `src/components/cart/CartDrawer.tsx`, `src/components/cart/MiniCartDropdown.tsx` | cart drawer | cart drawer + /cart |
| `src/components/account/AffiliatePayoutForm.tsx` | /account/affiliate | /account/** |
| `src/components/account/SubscriptionList.tsx` | /account/subscriptions | /account/** |
| `src/components/notifications/EverythingInAppToggle.tsx` | /account/notifications | /account/** |
| `src/components/wishlist/WishlistItemActions.tsx` | /account/wishlist (44px touch targets) | /account/** |
| `src/components/supplier/SupplierApplyWizard.tsx` | /supplier/apply, /suppliers/apply | /supplier/apply |
| `src/components/pwa/InstallPrompt.tsx` (+ its test) | mounted by the root layout | see below |

`src/components/pwa/InstallPrompt.tsx` is the one file mounted from the frozen root layout. Its
only change adds /login, /register and the four legal pages to `HIDDEN_ON`.
Those are all open routes. On home, category and product the prompt behaves
exactly as it did at the tag, so the output of the frozen pages is the same.

The page files under the frozen routes did not change either. `git diff
--name-status` over every `page.tsx` lists only account, auth, checkout, gift,
redeem and supplier-apply pages. None of them is home, category or product.

## Raw output

```
TAG=design-locked-2026-10-19 337d1a2a4  HEAD=11bd17be6  date -u: 2026-11-04T19:32:18Z

$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 src/components/account/AffiliatePayoutForm.tsx     |  10 +-
 src/components/account/SubscriptionList.tsx        |   5 +-
 src/components/cart/CartCouponForm.tsx             |  74 +++++-----
 src/components/cart/CartDrawer.tsx                 |  42 ++++--
 src/components/cart/CartLineItem.tsx               | 162 +++++++++++----------
 src/components/cart/CartPageView.tsx               | 102 +++++++++----
 src/components/cart/CartTotalsSidebar.tsx          | 106 ++++++++------
 src/components/cart/MiniCartDropdown.tsx           |  23 ++-
 src/components/cart/cart-page-view.test.tsx        | 134 +++++++++++++++++
 src/components/gifts/GiftPurchaseForm.tsx          | 117 +++++++++++++++
 .../notifications/EverythingInAppToggle.tsx        |  18 ++-
 .../notifications/ExpiryEmailSwitch.test.tsx       |  34 +++++
 src/components/notifications/ExpiryEmailSwitch.tsx |  52 +++++++
 .../notifications/PushTopicsSwitch.test.tsx        |  74 ++++++++++
 src/components/notifications/PushTopicsSwitch.tsx  |  90 ++++++++++++
 src/components/pwa/InstallPrompt.tsx               |  19 ++-
 src/components/pwa/install-prompt.test.tsx         |  22 +++
 .../supplier-apply/SupplierCardCheck.tsx           |  53 +++++++
 .../supplier/SupplierApplyWizard.test.tsx          |  52 +++++++
 src/components/supplier/SupplierApplyWizard.tsx    |   8 +
 .../turnstile/SupplierApplyChallenge.tsx           |  49 +++++++
 src/components/turnstile/TurnstileRefresh.tsx      |  71 +++++++++
 src/components/wishlist/WishlistItemActions.tsx    |   4 +-
 23 files changed, 1095 insertions(+), 226 deletions(-)

$ git diff --name-status --diff-filter=MDR design-locked-2026-10-19 -- (same paths)
M	src/components/account/AffiliatePayoutForm.tsx
M	src/components/account/SubscriptionList.tsx
M	src/components/cart/CartCouponForm.tsx
M	src/components/cart/CartDrawer.tsx
M	src/components/cart/CartLineItem.tsx
M	src/components/cart/CartPageView.tsx
M	src/components/cart/CartTotalsSidebar.tsx
M	src/components/cart/MiniCartDropdown.tsx
M	src/components/notifications/EverythingInAppToggle.tsx
M	src/components/pwa/InstallPrompt.tsx
M	src/components/pwa/install-prompt.test.tsx
M	src/components/supplier/SupplierApplyWizard.tsx
M	src/components/wishlist/WishlistItemActions.tsx

$ git diff --stat design-locked-2026-10-19 -- <FROZEN list per 04.11 amendment>
(exit 0, empty output = no change)

$ ls tailwind.config.*
(eval):1: no matches found: tailwind.config.*
0

$ git diff --name-status design-locked-2026-10-19 -- "src/app/**/page.tsx"
M	src/app/(account)/account/notifications/page.tsx
M	src/app/(account)/account/orders/[id]/page.tsx
M	src/app/(account)/account/orders/page.tsx
M	src/app/(account)/account/page.tsx
M	src/app/(account)/account/wallet/page.tsx
M	src/app/(auth)/admin-mfa/page.tsx
M	src/app/(auth)/forgot-password/page.tsx
M	src/app/(auth)/login/page.tsx
M	src/app/(auth)/mfa/page.tsx
A	src/app/(auth)/register/page.tsx
M	src/app/(auth)/reset-password/page.tsx
M	src/app/(auth)/signup/confirm/page.tsx
M	src/app/(auth)/signup/page.tsx
A	src/app/(store)/checkout/confirm/page.tsx
M	src/app/(store)/checkout/page.tsx
M	src/app/(store)/checkout/return/page.tsx
M	src/app/(store)/gift/[token]/page.tsx
M	src/app/(store)/suppliers/apply/page.tsx
A	src/app/(supplier-public)/supplier/apply/page.tsx
A	src/app/partner/redeem/page.tsx
M	src/app/redeem/[token]/page.tsx
```

```
$ git diff --name-status design-locked-2026-10-19 -- "src/app/(store)" "src/app/(main)" "src/app/(shop)" | grep -v -E "checkout|gift/"
M	src/app/(store)/suppliers/apply/page.tsx
$ git ls-tree -r --name-only design-locked-2026-10-19 src/app | grep -E "^src/app/(\([^)]*\)/)?page\.tsx$"
src/app/(store)/page.tsx
```

## Gates (this commit, docs only)

```
pnpm type-check: exit 0
pnpm lint: exit 0
docs-index-gate: OK. 318 documents, all listed; 2 out-of-docs row(s) resolve.
docs-path-audit: OK. 160 known dangling references, no change.
vitest src/__tests__/ci-docs-inventory.test.ts: 6 passed (6)
```
