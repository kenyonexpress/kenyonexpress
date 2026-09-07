# Dependency audit (production)

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only. Where this file and
`docs/THIRD-PARTY-DEPENDENCIES.md`
or
`docs/DEPENDENCIES.md`
disagree, the live
`package.json`
on this branch plus import sites in
`src/`
are right.

Read 2026-09-07. This file does **not** run
`pnpm audit`.
It classifies every **production** key in
`package.json`
`dependencies`
by why it is there, what would replace it, and whether it looks abandoned or oversized.

DevDependencies are out of scope except where they leak into the runtime story (drizzle-kit, playwright browsers).

External services that are **not** npm packages (Cardcom, Meilisearch, Upstash, Resend, Twilio, ntfy, Axiom, PostHog, R2, GitHub Actions cron) are in §3. They still ship in production.

---

## 0. How to read a row

| Field | Meaning |
|---|---|
| Why | The call site that would break if the package vanished tomorrow |
| Replace with | The realistic substitute, not a wishlist |
| Verdict | **load-bearing** / **narrow** / **inert** / **abandoned** / **oversized** |

**Abandoned** means zero imports under
`src/`
(and no
`next.config`
plugin). **Inert** means imported but off unless env is set. **Oversized** means the package is a platform, and this repo uses a sliver.

Do not delete an abandoned package from this docs branch. Deletion is a code change on the code worktree, with
`pnpm`
and a bundle gate.

---

## 1. Framework core (load-bearing)

| Package | Version pin | Why it is here | Replace with | Verdict |
|---|---|---|---|---|
| `next` | 16.2.12 (exact) | App Router, `'use cache'`, `src/proxy.ts`, route handlers, server actions | Nothing. The product is a Next app. | load-bearing |
| `react` / `react-dom` | 19.2.4 (exact) | UI. Matches Next 16. | Nothing. | load-bearing |
| `zod` | ^3.25.76 | Every action input, analytics ingest, checkout schemas | Valibot or ArkType would be a rewrite of every boundary | load-bearing |
| `@supabase/supabase-js` | ^2.105.3 | Runtime data layer. Anon + user session. | The database is Postgres; the client is this. A raw `postgres` driver would skip Auth and RLS session | load-bearing |
| `@supabase/ssr` | ^0.10.2 | Cookie session in
`src/lib/supabase/server.ts`
and
`src/proxy.ts` | Hand-rolled cookie bridge. Do not. | load-bearing |

There is no
`packages/`
workspace app. `pnpm-workspace.yaml`
exists for
`apps/mobile`
and for
`pnpm.overrides`
(sharp, audit pins). The web app is
`src/`.

---

## 2. Every production dependency

### 2.1 Auth, data, money-adjacent

| Package | Why | Replace with | Verdict |
|---|---|---|---|
| `@supabase/supabase-js` | Queries, RPC, Auth, Realtime (limited) | See §1 | load-bearing |
| `@supabase/ssr` | Session cookies | See §1 | load-bearing |
| `drizzle-orm` | **Schema files only**:
`src/db/schema/{commerce,orders,order-items,commerce-managed}.ts`.
No runtime `db.select`. | Keep as a typed CHECK mirror, or delete the four files and stop pretending there is an ORM | **oversized / unused at runtime** |
| `postgres` | **Not imported from `src/`**. Scripts:
`scripts/db-doc.mjs`,
`scripts/_voucher-race.mjs`. | `pg` for those two scripts, or `supabase-js` | **abandoned in the app**; script-only |

`drizzle-kit`
is a **devDependency**. `drizzle.config.ts`
points at
`src/db/schema/commerce-managed.ts`.
ADR and this pack: **do not `db push`**. The live schema is Supabase migrations + human apply.

### 2.2 Payments and crypto (no Cardcom SDK)

Cardcom is HTTP to
`/Interface/*.aspx`.
There is no
`cardcom`
npm package. That is a decision (ADR 0007), not a missing dep.

| Package | Why | Replace with | Verdict |
|---|---|---|---|
| `qrcode` | `src/lib/vouchers/qr-image.ts` PNG/data URL for voucher QR | A smaller QR encoder. Not worth it. | narrow |
| `node-forge` | `src/lib/wallet/pkpass.ts` Apple Wallet pass signing | A dedicated pkpass library, or drop Wallet | narrow (Apple Wallet only) |

### 2.3 UI kit

| Package | Why | Replace with | Verdict |
|---|---|---|---|
| `lucide-react` | Icons across storefront, admin, account | SVG sprites. Bundle cost is the issue, not the API. | load-bearing for chrome, **oversized** if new icons keep landing on the home JS |
| `@radix-ui/react-dialog` | `src/components/ui/dialog.tsx`, admin category dialog | Native `<dialog>` + own focus trap | narrow |
| `@radix-ui/react-dropdown-menu` | `src/components/ui/dropdown-menu.tsx` | Details/summary. A11y cost. | narrow |
| `@radix-ui/react-label` | `src/components/ui/label.tsx` | Plain `<label>` | narrow |
| `@radix-ui/react-select` | Form selects | Native `<select>` (worse mobile styling) | narrow |
| `@radix-ui/react-slot` | Button `asChild` | Copy the 20-line Slot | narrow |
| `@radix-ui/react-toast` | Installed | **Sonner is what call sites import** (`toast` from `sonner`). Confirm Radix toast has a real importer before calling it load-bearing. | suspect unused |
| `sonner` | Toasts: cart, admin tables, referrals, payouts UI | Radix toast, or none | load-bearing for admin feedback |
| `class-variance-authority` | `button.tsx`, `label.tsx` variants | Duplicate class strings | narrow |
| `clsx` / `tailwind-merge` | `cn()` | One of them, not both, if you enjoy pain | narrow, conventional |
| `next-themes` | `sonner.tsx` `useTheme` | Hard-code light. The storefront is not a theme product. | narrow |
| `react-hook-form` + `@hookform/resolvers` | `src/components/ui/form.tsx` | Controlled inputs. Admin forms are the consumers. | narrow (admin/account) |
| `recharts` | `src/components/admin/reports/SalesChart.tsx` | CSS bars, or no chart until there are sales | **oversized** for one admin chart |
| `@dnd-kit/core` + `sortable` + `utilities` | **Zero imports under `src/`**. Only listed in
`package.json`. | Delete on a code branch after grep stays empty | **abandoned** |

### 2.4 Content, i18n, images

| Package | Why | Replace with | Verdict |
|---|---|---|---|
| `@next/mdx` + `@mdx-js/loader` + `@mdx-js/react` + `@types/mdx` | `next.config.ts` `createMDX`,
`pageExtensions` includes `mdx`,
`src/content/blog/*/page.mdx`,
root
`mdx-components.tsx` | MDX-less blog in the CMS/DB | narrow (blog) |
| `next-intl` | Plugin in
`next.config.ts`,
`src/i18n/request.ts`,
`src/i18n/routing.ts`
(`locales: ['he','en']`, default `he`, `localePrefix: 'as-needed'`) | Delete en until a real i18n project (see
`docs/cursor/POST-LAUNCH-ROADMAP.md`). Hebrew copy is source strings, not message catalogs. | **wired, mostly unused**; English locale is a footgun |
| `sharp` | Next image optimizer. **Pinned via
`pnpm.overrides`
to `^0.35.3`** because Next's nested 0.34.5 could not decode this repo's AVIF (`source: bad seek` → silent full-size original). | Do not let Next's nested sharp win. | load-bearing |

`@types/mdx`
as a **production** dependency is odd. Types belong in
`devDependencies`.
Moving it is a code-branch hygiene PR, not a runtime fix.

### 2.5 Observability (npm)

| Package | Why | Replace with | Verdict |
|---|---|---|---|
| `@sentry/nextjs` + `@sentry/node` | `sentry.server.config.ts`,
`sentry.edge.config.ts`,
`instrumentation.ts`,
`capturePaymentError`,
`global-error.tsx` | Console only. You would lose money-path grouping. | load-bearing when `SENTRY_DSN` is set; **inert** without it |
| `@vercel/analytics` | `src/app/layout.tsx` | Off. Duplicate of first-party
`analytics_events`
+ PostHog HTTP | narrow / optional |
| `@vercel/speed-insights` | same layout | Off. Web vitals also go through the first-party
`web_vital`
event | narrow / optional |

PostHog, Axiom, ntfy are **fetch**, not packages. See §3.

### 2.6 AI

| Package | Why | Replace with | Verdict |
|---|---|---|---|
| `@anthropic-ai/sdk` | `src/server/ai/client.ts`
`runAgent`. Agents: `product_description`, `support_chat`, `pricing_advisor`, `fraud_signals`. **Off unless
`AI_AGENTS_ENABLED`
and the per-agent flag are plainly true.** Agents advise; they do not write
`platform_percent`. | Do not call Anthropic. The door stays. | **inert by default**; do not enable near launch |

### 2.7 Cart state

| Package | Why | Replace with | Verdict |
|---|---|---|---|
| `zustand` | `src/lib/cart/store.ts` persisted cart;
`CartProvider`,
`CartNavLink` | React context + localStorage. You would re-implement persist. | load-bearing for the cart |

---

## 3. Production runtime that is not in `dependencies`

These fail in production without an npm row. Treat them as dependencies anyway.

| System | How the app talks | Why | Replace with | If missing |
|---|---|---|---|---|
| Supabase Postgres + Auth | `@supabase/*` | Source of truth | Nothing | Nothing works |
| Cardcom Low Profile | `fetch` to
`/Interface/*.aspx` | Charges, tokens, refunds, invoices (docs 4 / credit 3) | No second acquirer is designed | No money |
| Cloudflare R2 | AWS S3-compatible signed PUT | Product images | Supabase Storage (rejected: R2 public base is the storefront URL) | 32 WP paths 404 at DNS cutover |
| Upstash Redis | REST
`UPSTASH_REDIS_REST_*` | Rate limit when configured | Postgres
`check_rate_limit`
(service_role only after 127) | Degraded limiter, not an outage |
| Upstash QStash | REST when configured | Search index jobs | Inline drain | Index lag, ILIKE still serves `/search` |
| Meilisearch | REST
`MEILISEARCH_HOST`
+ API key. **No Meilisearch SDK.** | Search backend | Postgres `ILIKE` (same `ProductCard` shape) | Search still works, worse ranking |
| Resend | REST (no SDK in the money path) | Voucher email, outbox drain | Console log. Buyers have no voucher. | Launch blocker (H1) |
| Twilio | REST in
`src/lib/whatsapp/twilio.ts` | WhatsApp / SMS OTP | Phone auth off | Login by email still works |
| Sentry EU | npm + tunnel `/monitoring` | Money-path exceptions | ntfy + Vercel logs | Blind at 03:00 |
| Axiom | `fetch` ingest | Same JSON as
`log.ts` | Vercel log drain | Searchable logs worse |
| PostHog | `fetch` `/capture/` | Product analytics, SDK-free | First-party
`analytics_events`
only | Funnel still in DB (after 169) |
| ntfy.sh | `fetch` POST | Phone interrupt for money failures | SMS, or nothing | Operator sleeps through a charged-unfinalized order |
| Vercel `fra1` | Hosting | Next runtime | Another Node host. Cron would still be GitHub Actions. | No site |
| GitHub Actions cron | Bearer
`CRON_SECRET`
against
`https://kenyonexpress.vercel.app` | Twelve jobs in
`scripts/cron-jobs.json`. **Not** `vercel.json` crons (Hobby silence). | Vercel Pro cron, or a VM | Outbox, stranded payments, expire, retention stop |

---

## 4. Abandoned or oversized (act on a code branch)

Ranked by "safe to remove" then by bundle harm.

| # | Package | Evidence | Risk if removed blindly |
|---|---|---|---|
| 1 | `@dnd-kit/*` (three packages) | Grep of
`src/`
is empty. Only
`package.json`. | None, if grep stays empty after a full tree search including stories |
| 2 | `postgres` | App unused; two scripts | Those scripts die. They are not the storefront. |
| 3 | `drizzle-orm` | No runtime queries | Schema files and any future drizzle-kit generate die. Production schema does not. |
| 4 | `@radix-ui/react-toast` | Call sites use
`sonner` | Confirm no importer, then drop |
| 5 | `recharts` | One admin chart | Admin reports become a table. Fine at zero sales. |
| 6 | `next-intl` English locale | Routing declares `en`. Copy is Hebrew literals. | Leaving `en` invites a half-translated URL. Removing the plugin is a Next config change. |
| 7 | `@anthropic-ai/sdk` | Door exists, flags default off | Keep the door; do not enable. Removing the package is optional. |
| 8 | `@vercel/analytics` + `speed-insights` | Layout import, duplicate telemetry | Slightly less vendor JS. First-party events remain. |
| 9 | `lucide-react` | Many icons, including home | Tree-shake per icon. The failure mode is adding icons to the masthead without measuring
`scripts/bundle-gate.mjs`. |
| 10 | `node-forge` | Apple Wallet only | If pkpass is not a launch feature, it is launch-scope bloat, not abandonment |

**Do not** drop
`sharp`
or the
`pnpm.overrides`
pin. AVIF silently regresses to original bytes.

**Do not** add
`playwright`
(the browser package).
`scripts/compare.mjs`
imports
`@playwright/test`
(already a devDependency). See
`AGENTS.md`.

---

## 5. Overrides that are load-bearing

`pnpm-workspace.yaml`
`overrides`:

| Pin | Why |
|---|---|
| `sharp: ^0.35.3` | Next nested 0.34.5 cannot decode repo AVIF |
| `postcss`, `nanoid`, `brace-expansion`, `fast-uri` | Transitive advisories with no direct bump |
| `minimatch@9>brace-expansion: ^2.0.2` | Global brace-expansion v5 broke minimatch@9 CJS (coverage run crash after green tests) |
| `@esbuild-kit/core-utils>esbuild` | drizzle-kit's unmaintained 0.18 line (GHSA-67mh-4wv8-2f99) |
| `vite>esbuild` | GHSA-g7r4-m6w7-qqqr |

`allowBuilds`
explicitly **false** for
`@sentry/cli`
(postinstall binary unused). True for biome, swc, esbuild, sharp, parcel watcher.

---

## 6. What a new engineer must not do

- `npm i` / `npm add`. Cannot work. `AGENTS.md`.
- Add a Cardcom or Stripe SDK "to modernise" the payment boundary. Legacy aspx is the contract.
- Add
  `posthog-js`
  or
  `ioredis`
  or a Meilisearch JS client. The HTTP doors exist so those SDKs never enter the bundle.
- Add Redis as a **page cache**. Catalogue cache is Next
  `'use cache'`
  (ADR 0009). Upstash here is rate limit + QStash, not HTML.
- Enable
  `AI_AGENTS_ENABLED`
  on production to "see if it works". Pricing advisor must never write
  `platform_percent`.

Replacement rule: if the substitute talks to money, it goes through
`src/lib/money.ts`
and a test in
`docs/cursor/TEST-MAP.md`.
If it talks to rows, it obeys
`docs/cursor/RLS-CATALOG.md`.
