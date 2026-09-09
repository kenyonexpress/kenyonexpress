# Courses

A course product type, its lessons, who may watch them, and the certificate.
Section 91.

**The feature flag is off.** `212_courses_phase2.sql` seeds
`phase_config.course` disabled, so the type is not listed, not purchasable and
its product pages 404. See `docs/PRODUCT-PHASES.md`.

## The shape

Class Table Inheritance. A row in `course_products` **is** the statement that a
product is a course.

```
products              the sale: price, supplier, status, slug
  course_products     the subtype: summary, estimated length, certificate flag
    course_modules    ordered sections
      course_lessons  ordered lessons, each with an R2 video key
        course_progress   per learner, per lesson: seconds and completion
```

**Why not columns on `products`.** That table already carries 60-odd columns of
which `coupon_expiry_days`, `recurring_amount_agorot` and `billing_interval` are
each meaningful for exactly one type and null for every other. A course adds at
least four more of the same kind. CTI keeps them where they mean something, and
means [91] can be reverted by dropping three tables rather than by finding four
columns.

`course_modules` and `course_lessons` have `UNIQUE (parent, position)`. Migration
206 records what the absence of that constraint costs on `homepage_sections`:
swapping two rows that share a position moves nothing.

## Access is the security boundary

`has_course_access(product_id)` is a `SECURITY DEFINER` function that **reads
`auth.uid()` and does not take a uid**. That distinction is one this database has
already been bitten by: a definer function accepting a uid attributes the check
to whoever the caller names, which is an authorisation bypass wearing a
parameter.

Two routes in:

| route | test | why that test |
| --- | --- | --- |
| purchase | an `order_items` row on an order of theirs with `paid_at IS NOT NULL` | **not** `status = 'paid'`: the status moves on to `fulfilled` and `platform_settled`, and a string check would revoke access the moment an operator settled the order |
| subscription | `active`, or `past_due` with fewer than 3 failed attempts | cutting a customer off on the **first** declined retry is premature; the point of three attempts is that the first often fails for a reason that resolves |

Enforced twice, independently:

- **RLS on `course_lessons`.** A lesson row carries `video_r2_key`, so reading
  the row is the first half of watching the video. Preview lessons are open;
  everything else needs access.
- **The signing action.** `lessonVideoUrl` checks access before minting a URL.

So a bug in one does not open a paid lesson.

### Two policies, split by role

The first draft was one policy `TO anon, authenticated` reading
`is_preview OR has_course_access(...)`. It failed for anon with **`permission
denied for function has_course_access`**: privileges are checked on the whole
expression rather than short-circuited past the `is_preview` branch that would
have avoided the call.

Granting the function to anon would have worked and bought nothing - `auth.uid()`
is null for anon, so it always returns false - while adding an RPC endpoint and
an advisor warning. Splitting by role is the move
`120_split_public_select_policies_by_role.sql` already made on this database,
and it says what is true: an anonymous visitor sees previews, and nothing else is
even asked about them.

### And one contradiction the probe caught

The first draft also carried `REVOKE ALL ON course_products, course_modules FROM
anon`, directly contradicting the public-read policies above it. **A policy
grants nothing; it only filters what a GRANT already allows.**

The failure is worth recording for its shape: the error was `permission denied
for table course_modules`, **raised by a query against `course_lessons`** -
because the lesson policy's subquery reads modules to find the product. A
missing grant surfaces on the table the POLICY reads, not on the table being
queried.

## Video

A private R2 bucket, `kenyonexpress-course-videos`, and a signed URL minted per
request after the access check.

The lesson row stores the **object key, never a URL**. A stored URL is either
public - which defeats the point - or a signed one that expires, which is a URL
that is wrong for most of its life.

**Thirty minutes, not the hour `createR2SignedDownloadUrl` defaults to.** Long
enough to watch a lesson without re-signing, short enough that a URL pasted into
a group chat stops working before most people click it.

The bucket carries a 2 GB cap rather than the 20 MB every other bucket has, and
`r2-buckets.test.ts` records the exception with its reason: the cap exists to
stop an upload form being a way to fill a bucket, not to enforce one number
everywhere. `video/quicktime` is allowed because that is what an iPhone
produces, and a seller filming a lesson on a phone is the likeliest first upload
this ever sees.

## Progress

The client reports a **position**; the server decides **completion**.

A `completed: true` flag from the browser would be a certificate anybody can
mint with one fetch, and a certificate is the document most likely to be shown
to an employer. So `watchedEnough` compares the stored seconds against the
lesson's own `duration_seconds`.

**Ninety per cent, not a hundred.** A player almost never reports the final
second: `timeupdate` stops short, `ended` fires after the last frame, and a
viewer who skips the closing card never reaches it. Requiring 100% leaves a
course permanently at "one lesson to go" for somebody who has watched
everything, and no certificate.

**The position only ever moves forward.** A player that reloads reports 0 before
its first `timeupdate`, and storing that would restart an hour-long lesson
somebody had already watched.

**`completed_at` is set once and never moved.** Re-watching must not re-date the
certificate, which is why the write reads the row first.

**A lesson with no known duration cannot be completed by watching.** Nothing on
the server knows how long it is, so the explicit button is the only honest way
to finish it - and that is what the button is for.

**An empty course is 0%, not 100%.** `0/0` is one, arithmetically, and a course
with no lessons reporting itself finished would issue a certificate for
attending nothing.

## The certificate

A4 landscape, Heebo embedded and subsetted, every string through `toVisual`.

**`pdf-lib` applies no bidi pass at all.** Hebrew handed to it straight comes out
reversed, in a valid PDF, with no error - which is exactly how [79] shipped
three Open Graph cards reading `סרפסקא ןוינק` before anybody downloaded one and
looked. So the test asserts the reordering the page depends on, separately from
asserting that the document builds.

The test also runs `// @vitest-environment node`, and the reason is already
documented in `settlement-pdf.test.ts`: under jsdom a Buffer from `node:fs`
belongs to a different realm than jsdom's `Uint8Array`, so pdf-lib's
`instanceof` check fails and it reports the font as **"of type NaN"**. This test
hit exactly that on its first run.

**What it deliberately does not claim:** no grade, no hours of study, no
accreditation, no signature of a person. This system knows one fact - which
lessons were marked complete, and when the last one was. Printing anything else
would be inventing it.

The date is the **last** completion, not the first: a certificate says when the
course was finished, and the course was finished when its last lesson was.

## What was not done

**No course player UI.** The phase flag is off and there are zero course
products, so a player would be a screen nothing can reach. The data layer, the
access boundary, the progress rules and the certificate are what a player needs;
building it is a UI task for the day a course exists.

**No admin course builder.** Same reason. Courses are created over the service
role, and the shape a builder needs is settled by the schema above.

**No completion emails or reminders.** A notification question rather than a
course one; it belongs with the outbox work.

**No quizzes, no assignments, no discussion.** None was asked for, and each
would change what a certificate means.
