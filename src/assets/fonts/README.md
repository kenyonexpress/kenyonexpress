# Vendored fonts

`Heebo-Regular.ttf` and `Heebo-Bold.ttf`, for `next/og` only. Nothing on the
storefront reads them — the pages get Heebo through `next/font/google`, which
self-hosts and subsets it at build time.

## Why they are checked in rather than reused from `next/font`

`next/og` renders through Satori, which:

- has **no system fonts**. A face that is not passed in explicitly does not
  exist, and a glyph with no face is dropped. Every Hebrew character on an Open
  Graph card renders as nothing while the route still answers 200 with a valid
  PNG and the build stays green.
- **cannot read woff2**, which is the only form `next/font` leaves behind in
  `.next/static/media`.

So the faces have to be TTF, on disk, at a path a serverless function can read.
44KB each, already subset by Google Fonts to Hebrew + Latin.

`src/app/og-fonts.test.ts` asserts both files exist, are large enough to be real,
and begin with the `sfnt` 1.0 header — a zero-byte file or an LFS pointer passes
an existence check and fails on the phone.

## Licence

SIL Open Font License 1.1. Full text in `OFL.txt`, retained as the licence
requires. Copyright 2014 The Heebo Project Authors
(https://github.com/OdedEzer/heebo).
