-- 212_courses_phase2.sql
--
-- Courses: a product subtype, its lessons, who may watch them, and how far
-- they got.
--
-- =============================================================================
-- TWO TRANSACTIONS, AND THE REASON IS MEASURED
-- =============================================================================
--
-- `ALTER TYPE ... ADD VALUE` was probed against this database inside a `DO`
-- block that ended in a `RAISE`. It was ACCEPTED - Postgres 17 permits it
-- inside a transaction - and it rolled back cleanly; `pg_enum` was re-read
-- afterwards and still held exactly `coupon, physical, service, recurring`.
--
-- What is still forbidden is USING the new value in the transaction that added
-- it. Nothing below needs to (`phase_config.product_type` is text, and
-- `course_products` keys on `product_id`), but the split is kept anyway so that
-- the next statement somebody adds cannot be the one that discovers this.
--
-- =============================================================================
-- CTI, AND WHY THE SUBTYPE IS A TABLE RATHER THAN COLUMNS ON `products`
-- =============================================================================
--
-- `products` already carries 60-odd columns, of which `coupon_expiry_days`,
-- `recurring_amount_agorot` and `billing_interval` are each meaningful for one
-- type and null for every other. A course adds at least four more of the same
-- kind.
--
-- Class Table Inheritance keeps them where they mean something: a row in
-- `course_products` IS the statement that this product is a course, its
-- presence is checkable in one join, and a physical product cannot accidentally
-- acquire a certificate template. It also means [91] can be reverted by
-- dropping three tables rather than by finding four columns.
--
-- =============================================================================
-- ACCESS IS A FUNCTION, AND IT IS THE SECURITY BOUNDARY
-- =============================================================================
--
-- A lesson's video is a signed R2 URL, and the signature is issued by a server
-- action. The action asks this function. So `has_course_access` is not a
-- convenience - it is the thing standing between a paid course and anybody with
-- the product's uuid.
--
-- IT READS `auth.uid()` RATHER THAN TAKING A uid. That distinction is the one
-- this database has already been bitten by: a SECURITY DEFINER function that
-- accepts a uid as an argument attributes the check to whoever the caller
-- names, which is an authorisation bypass wearing a parameter. `is_admin()` and
-- `is_supplier_member()` take the caller's identity the same way.
--
-- TWO ROUTES IN, and both are [91]'s own words: a one-time purchase, or an
-- active subscription.
--
--   purchase      an `order_items` row for this product on an order that
--                 belongs to the caller and has actually been paid. `paid_at IS
--                 NOT NULL` and not `status = 'paid'`: the status moves on to
--                 `fulfilled` and `platform_settled`, and a check on the string
--                 would revoke access the moment an operator settled the order.
--
--   subscription  `active`, or `past_due` while the dunning window is still
--                 open. Cutting a customer off on the FIRST declined retry is
--                 hostile and premature - the whole point of three attempts is
--                 that the first one often fails for a reason that resolves.
--                 Once the attempts are spent, access ends with them.

BEGIN;

ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'course';

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =============================================================================
-- 1. course_products  (the CTI subtype)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_products (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,

  -- Shown before purchase, so a buyer knows what they are committing to.
  summary_he text CHECK (summary_he IS NULL OR length(summary_he) <= 2000),

  -- Advertised length. NOT derived from the lessons: a lesson's
  -- `duration_seconds` is what the file happens to be, and the number on the
  -- sales page is a promise. Two numbers that usually agree and sometimes
  -- should not.
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 100000),

  -- Whether finishing produces a certificate. Off by default: a certificate is
  -- a claim about a person's competence, and issuing one should be a decision.
  certificate_enabled boolean NOT NULL DEFAULT false,

  -- The name that appears on the certificate. Null means the product's own.
  certificate_title_he text CHECK (certificate_title_he IS NULL OR length(certificate_title_he) <= 200),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS course_products_set_updated_at ON public.course_products;
CREATE TRIGGER course_products_set_updated_at
  BEFORE UPDATE ON public.course_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 2. course_modules and course_lessons
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_modules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.course_products(product_id) ON DELETE CASCADE,
  title_he   text NOT NULL CHECK (length(btrim(title_he)) BETWEEN 2 AND 200),
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Two modules cannot share a slot in one course. `position` on
  -- `homepage_sections` has no such constraint and 206 records what that costs:
  -- swapping two equal numbers moves nothing.
  UNIQUE (product_id, position)
);

DROP TRIGGER IF EXISTS course_modules_set_updated_at ON public.course_modules;
CREATE TRIGGER course_modules_set_updated_at
  BEFORE UPDATE ON public.course_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title_he  text NOT NULL CHECK (length(btrim(title_he)) BETWEEN 2 AND 200),
  position  integer NOT NULL DEFAULT 0,

  -- The R2 object key, never a URL. A stored URL is either public - which
  -- defeats the point - or a signed one that expires, which is a URL that is
  -- wrong for most of its life. The signature is minted per request by
  -- `createR2SignedDownloadUrl` after `has_course_access` has said yes.
  video_r2_key text CHECK (video_r2_key IS NULL OR length(video_r2_key) BETWEEN 3 AND 500),

  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 86400),

  -- A free sample. `is_preview` is the ONLY thing that lets an unpaid visitor
  -- reach a video, and it is per lesson rather than per course so a seller can
  -- open the first one without opening the rest.
  is_preview boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (module_id, position)
);

DROP TRIGGER IF EXISTS course_lessons_set_updated_at ON public.course_lessons;
CREATE TRIGGER course_lessons_set_updated_at
  BEFORE UPDATE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS course_modules_product_idx ON public.course_modules (product_id, position);
CREATE INDEX IF NOT EXISTS course_lessons_module_idx ON public.course_lessons (module_id, position);

-- =============================================================================
-- 3. has_course_access
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_course_access(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.product_id = p_product_id
         AND o.user_id = auth.uid()
         AND o.paid_at IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
        FROM public.subscriptions s
       WHERE s.product_id = p_product_id
         AND s.user_id = auth.uid()
         AND (
           s.status = 'active'
           OR (s.status = 'past_due' AND s.failed_attempts < 3)
         )
    )
  );
$$;

-- Granted to authenticated, and it MUST be: the RLS policies below call it, and
-- a policy expression is evaluated as the calling role. anon is not granted it:
-- an anonymous caller has no `auth.uid()` and would always get false, so the
-- grant would buy nothing and add an endpoint.
REVOKE ALL ON FUNCTION public.has_course_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_course_access(uuid) TO authenticated;

-- =============================================================================
-- 4. course_progress
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.course_progress (
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,

  -- How far in, in seconds, so the player can resume. Not a percentage: a
  -- percentage of a video whose length later changes is a position that moves.
  seconds_watched integer NOT NULL DEFAULT 0 CHECK (seconds_watched >= 0),

  -- Set once, when the lesson is finished, and never moved. "When did they
  -- complete it" is what a certificate date comes from, and re-watching must
  -- not reissue a certificate with a later date.
  completed_at timestamptz,

  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, lesson_id)
);

DROP TRIGGER IF EXISTS course_progress_set_updated_at ON public.course_progress;
CREATE TRIGGER course_progress_set_updated_at
  BEFORE UPDATE ON public.course_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 5. RLS
-- =============================================================================

ALTER TABLE public.course_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

-- The course's own description is a sales page. Public.
DROP POLICY IF EXISTS course_products_public_read ON public.course_products;
CREATE POLICY course_products_public_read ON public.course_products
  FOR SELECT TO anon, authenticated USING (true);

-- The syllabus is public too: a buyer decides from the module titles, and
-- hiding them would mean selling a course whose contents cannot be seen.
DROP POLICY IF EXISTS course_modules_public_read ON public.course_modules;
CREATE POLICY course_modules_public_read ON public.course_modules
  FOR SELECT TO anon, authenticated USING (true);

-- LESSONS ARE THE LINE. A lesson row carries `video_r2_key`, so reading the row
-- is the first half of watching the video. A preview lesson is open; everything
-- else needs access.
-- TWO POLICIES, SPLIT BY ROLE, AND THE PROBE IS WHY.
--
-- The first draft was one policy `TO anon, authenticated` reading
-- `is_preview OR has_course_access(...)`. It failed for anon with
-- `permission denied for function has_course_access` - `anon` is not granted
-- EXECUTE on it, and Postgres checks privileges on the whole expression rather
-- than short-circuiting past the call the `is_preview` branch would have
-- avoided.
--
-- The obvious fix is to grant the function to anon. It would be harmless -
-- `auth.uid()` is null for anon so it returns false - but it would add an RPC
-- endpoint and an advisor warning to buy nothing. Splitting by role is the same
-- move `120_split_public_select_policies_by_role.sql` already made on this
-- database, and it says what is true: an anonymous visitor sees previews, and
-- nothing else is even asked about them.
DROP POLICY IF EXISTS course_lessons_read ON public.course_lessons;
DROP POLICY IF EXISTS course_lessons_anon_preview ON public.course_lessons;
CREATE POLICY course_lessons_anon_preview ON public.course_lessons
  FOR SELECT TO anon
  USING (is_preview);

DROP POLICY IF EXISTS course_lessons_member_read ON public.course_lessons;
CREATE POLICY course_lessons_member_read ON public.course_lessons
  FOR SELECT TO authenticated
  USING (
    is_preview
    OR public.has_course_access(
         (SELECT m.product_id FROM public.course_modules m WHERE m.id = module_id)
       )
  );

-- Progress is the learner's own, and nobody else's - not another learner's, and
-- not the seller's. A seller who wants completion numbers gets a count from the
-- admin side, over the service role, without names.
DROP POLICY IF EXISTS course_progress_own ON public.course_progress;
CREATE POLICY course_progress_own ON public.course_progress
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No client WRITES anywhere. The admin builds courses over the service role,
-- like every other catalogue write in this repository.
--
-- ONLY THE WRITES ARE REVOKED, AND THE FIRST DRAFT OF THIS FILE GOT THAT WRONG.
-- It also carried `REVOKE ALL ON course_products, course_modules FROM anon`,
-- directly contradicting the public-read policies above: a policy grants
-- nothing, it only filters what a GRANT already allows, so revoking SELECT made
-- those policies unreachable.
--
-- The probe caught it, and how it failed is the part worth keeping. The error
-- was `permission denied for table course_modules` raised by a query against
-- `course_lessons` - because the lesson policy's subquery reads `course_modules`
-- to find the product. A missing grant surfaces on the table the POLICY reads,
-- not on the table being queried, which is a long way from the line that caused
-- it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.course_products FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.course_modules FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.course_lessons FROM anon, authenticated;

-- =============================================================================
-- 6. The phase switch, off
-- =============================================================================
--
-- Text key, which is why 210 made it text: this row exists before any product
-- can be created with the new type, which is the order that keeps a course from
-- being sellable the moment the enum learns the word.

INSERT INTO public.phase_config (product_type, phase, is_enabled, enabled_at, note)
VALUES ('course', 2, false, NULL, 'שלב 2, כבוי לפי [91]. אין קורסים.')
ON CONFLICT (product_type) DO UPDATE
  SET is_enabled = false, note = excluded.note;

COMMIT;
