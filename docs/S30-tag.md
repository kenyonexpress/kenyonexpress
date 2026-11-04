# S30: tag v2.1.0-checkout

Queue item S30, 05.11.2026. **Result: LAUNCH-READY pending-external.**

## Tag

```
$ git tag -a v2.1.0-checkout -m "checkout complete, design locked 2026-10-19"
$ git push origin v2.1.0-checkout
To github.com:kenyonexpress/kenyonexpress.git
 * [new tag]             v2.1.0-checkout -> v2.1.0-checkout
$ git ls-remote --tags origin 'v2.1.0-checkout*'
26150583d0165e7e904b422067be1b1db1230a3e	refs/tags/v2.1.0-checkout
4f5a054d3d74ad349b1690e3f459a95f7a232226	refs/tags/v2.1.0-checkout^{}
```

The tag points at `4f5a054d3`, which was both HEAD and `origin/closeout/v1-final` when it was created.
A tag push does not trigger a Vercel deploy, because only branch pushes deploy.

## The code is the code S29 measured

S29 measured `65f6c5912` (8166 vitest tests passed across 687 files, tsc 0, lint 0). Since then only docs have changed:

```
$ git diff --stat 65f6c5912 4f5a054d3
 STATE.md                 |   8 +--
 docs/INDEX.md            |   5 +-
 docs/LAUNCH-CHECKLIST.md | 112 +++++++++++++-----------------
 docs/MANUAL.md           | 177 ++++++++---------------------------------------
 docs/S29-launch.md       |  77 +++++++++++++++++++++
 docs/STATE-ARCHIVE.md    |   6 ++
 6 files changed, 167 insertions(+), 218 deletions(-)
```

Rerun at the tag today:

```
$ pnpm type-check   -> tsc exit 0
$ pnpm lint         -> lint exit 0
input-dir gate: clean (28 tel/email/url inputs, all carry dir)
docs-index-gate: OK. 319 documents, all listed; 2 out-of-docs row(s) resolve.
docs-path-audit: OK. 160 known dangling references, no change.
```

## Freeze gate (FROZEN list, per the 04.11 scope amendment)

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout \
    src/components/hero src/components/header src/components/category src/components/storefront \
    src/components/product-card src/app/globals.css src/app/layout.tsx 'src/app/(store)/page.tsx' \
    tailwind.config.ts
(no output, rc=0)
$ git diff --stat design-locked-2026-10-19 -- src/components/SiteFooter.tsx
(no output, rc=0)
```

## LAUNCH.flag decision

The rule says to touch `~/ke-goals/LAUNCH.flag` only if the HOLD section is empty.
In `docs/LAUNCH-CHECKLIST.md`, measured 05.11 in S29, `## HOLD: ממתין לגורם חיצוני` has **9 open rows**:

1. Real Cardcom charging (a real ₪1 order and its refund against a real terminal)
2. Turning off `MAINTENANCE_MODE` (this comes after row 1)
3. Production email (one real send with the live `RESEND_API_KEY`)
4. Upstash rate limiting (not blocking)
5. R2 public URL (not blocking)
6. Rotating the leaked secrets
7. WhatsApp business verification
8. Axiom drain
9. Operator decisions on catalogue rows

```
$ ls ~/ke-goals/LAUNCH.flag
ls: /Users/ofir/ke-goals/LAUNCH.flag: No such file or directory
```

The flag was **not** created. `STATE.md` records `LAUNCH-READY pending-external`.
S30 is the last row of `~/ke-goals/final-queue.txt`, so the S queue is closed.
