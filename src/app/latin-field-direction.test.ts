import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A LATIN FIELD INSIDE AN RTL FORM IS `dir="ltr"`.
 *
 * The rule is not invented here. `NewsletterSignup` states it in a comment,
 * `ContactForm`, `SupplierLeadForm`, `SupplierForm` and the signup phone input
 * all follow it, and the QA checklist names the four kinds outright - phone,
 * email, slug, SKU. An address or a phone number is Latin even on a Hebrew
 * page, so the field is LTR while everything around it stays RTL. Without it
 * the caret starts on the wrong side and an `@` typed mid-string appears to
 * jump.
 *
 * MEASURED in the browser, twice, before the fixes:
 *
 *  - filling `you@example.com` gave computed direction `rtl` on /login,
 *    /forgot-password and /signup and `ltr` on /contact - the address flush
 *    right on three pages and flush left on the fourth, one site;
 *  - on /checkout the BUYER's own phone and email were `rtl` while the
 *    GIFT RECIPIENT's email a few fields below was `ltr`, in the same form.
 *
 * That second one is why this scans the whole app rather than one folder: the
 * inconsistency was inside a single file, so no per-page rule would have found
 * it. Scanned as source rather than rendered, because much of this markup sits
 * behind a `useState` toggle, a wizard step or a session - and the attribute is
 * static either way.
 *
 * WHAT THIS DELIBERATELY DOES NOT REQUIRE: pure numeric and date fields. Most
 * of them carry `dir="ltr"` already and that is left alone, but a bare digit
 * string reorders identically under either direction, so nothing is broken
 * without it and forcing the attribute onto the remaining few - the quantity
 * stepper, the category price filter, the checkout wallet box - would move
 * spinner arrows and change alignment for no legibility gain. The rule here is
 * about strings whose bidi ordering actually breaks: letters, `@`, `.`, `-`.
 */

const APP = join(process.cwd(), 'src/app')
const COMPONENTS = join(process.cwd(), 'src/components')

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) acc.push(full)
  }
  return acc
}

/**
 * Every `<input …/>` element in the file, as raw text, except the hidden ones.
 * A `type="hidden"` field has no caret and no glyphs - the first draft of this
 * scan flagged five of them (`icon_url`, `logo_url`, `image_url`), each the
 * hidden carrier for an upload widget, where `dir` would mean nothing at all.
 */
function inputs(source: string): string[] {
  return [...source.matchAll(/<input\b[\s\S]*?\/>/g)]
    .map((m) => m[0])
    .filter((input) => !/type="hidden"/.test(input))
}

/** `id="co-zip"` and `id="a_phone"` are the same field name as `zip`, `phone`. */
function fieldName(input: string): string {
  const raw = /name="([^"]+)"/.exec(input)?.[1] ?? /id="([^"]+)"/.exec(input)?.[1] ?? ''
  return raw.replace(/^(co|ps|a|v)[-_]/, '')
}

/**
 * A value that is a Latin STRING whatever the page language is. `inputMode`
 * counts alongside `type`, because the checkout phone is `inputMode="tel"` on
 * a plain text input; and so does the name, because a slug, an SKU, a barcode
 * and a coupon code are plain text inputs with nothing structural to go on.
 */
function isLatinString(input: string): boolean {
  return (
    /type="(email|tel|url)"/.test(input) ||
    /inputMode="(tel|email|url)"/.test(input) ||
    /^(slug|sku|barcode|code|name_en)$/.test(fieldName(input)) ||
    /_url$/.test(fieldName(input))
  )
}

/**
 * A value the customer types in Hebrew. Forced LTR these are the more visible
 * mistake of the two: a name or a street stranded on the wrong side of its own
 * box, with the caret jumping on every space.
 */
function isHebrewProse(input: string): boolean {
  return /^(full_name|name|term|street|city|apartment|entrance|address|notes_for_courier|title|subject|message|description)$/.test(
    fieldName(input),
  )
}

function label(file: string, input: string): string {
  return `${file.slice(process.cwd().length + 1)} → ${fieldName(input) || '?'}`
}

const FILES = [...walk(APP), ...walk(COMPONENTS)]

function offenders(predicate: (input: string) => boolean): string[] {
  const found: string[] = []
  for (const file of FILES) {
    for (const input of inputs(readFileSync(file, 'utf8'))) {
      if (predicate(input)) found.push(label(file, input))
    }
  }
  return found
}

describe('Latin fields on a Hebrew page', () => {
  it('finds the forms at all', () => {
    // Guards the whole suite against a rename quietly emptying it.
    const withInputs = FILES.filter((f) => inputs(readFileSync(f, 'utf8')).length > 0)
    expect(withInputs.length).toBeGreaterThan(10)
    expect(offenders(isLatinString).length).toBeGreaterThan(15)
  })

  it('marks every email, phone, slug and code input LTR', () => {
    const missing = offenders((i) => isLatinString(i) && !/dir="ltr"/.test(i))
    expect(missing, 'add dir="ltr"; the form around it stays RTL').toEqual([])
  })

  it('leaves the Hebrew fields alone', () => {
    const forced = offenders((i) => isHebrewProse(i) && /dir="ltr"/.test(i))
    expect(forced, 'remove dir="ltr"; the customer types these in Hebrew').toEqual([])
  })
})
