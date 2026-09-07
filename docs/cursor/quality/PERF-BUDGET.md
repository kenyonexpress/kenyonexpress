# Perf budget

Visual: `compare.mjs` home <11% at 380 / 768 / 1440. Script must append `docs/UI-PARITY-REPORT.md`.

JS: `scripts/bundle-gate.mjs` ratchet. Do not add `@dnd-kit` to storefront. Sentry tree-shake via `compiler.define`.

Images: sharp **0.35.3** (nested 0.34 serves original AVIF). `next/image`, correct `sizes`. Hero stills under 1024px.

CWV (targets, not current claims): LCP <2.5s mobile on production CDN; CLS <0.1; INP <200ms. Historical LCP was cookie banner / hero weight; do not regress.

Per route: `/` lightest; PDP images; checkout no Meili SDK (HTTP). `/admin` recharts allowed.

`KILL_SWITCH_CACHE` may miss LCP; do not use as default.

`NEXT_PUBLIC_*` rebuild. `cacheComponents` + `connection()` on debug routes.

---

## Second pass

Home <11% at 380/768/1440. sharp 0.35.3. No @dnd-kit on storefront. Checkout no Meili SDK. Kill cache is slower-correct.
