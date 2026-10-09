-- 210_media_ingest_queue.sql
--
-- The ingest ledger of ARCHITECTURE-MEDIA-R2: one row per source image the
-- platform is supposed to host itself, whatever host it currently sits on.
-- NOT the same thing as 049's `media_assets`, which is per-URL *metadata*
-- (alt/blur/renditions) for images that already have a home; this table is
-- about images that are still WAITING, and where each one ended up once the
-- ingest ran. Ingested rows additionally get a `media_assets` row so the
-- storefront's existing URL-join readers see them with no new code path.
--
-- WHY A LEDGER AND NOT JUST FILES IN A BUCKET. Measured 2026-09-09:
--   - the WXR export carries 398 distinct image attachment URLs, and the
--     WordPress origin that served them is GONE -- kenyonexpress.co.il now
--     serves the Next.js build, and /wp-content/* answers 403. 66 of them
--     (65 distinct sha256) were fetched and converted by the 06-media-sync dry
--     run before the origin died; the cache under wp_import/media is now the
--     ONLY copy of those bytes. The rest are unreachable until Ofir supplies a
--     wp-content backup. Which URL is in which bucket of fate is exactly what
--     this table records.
--   - products.images holds 49 third-party URLs (45 picsum.photos, 4
--     images.unsplash.com): demo hosts we do not control, each one a remote
--     dependency of the homepage grid.
--   - Cloudflare R2 is NOT ENABLED on the account (the API answers 403 code
--     10042, "Please enable R2 through the Cloudflare Dashboard"), so the
--     ingest run that fills this table stores bytes in the local fallback
--     (public/images/cdn/<key>) and says so in `storage`. When R2 is enabled,
--     re-running the ingest promotes the same content-addressed keys to R2 and
--     flips `storage` to 'r2'; the ledger is what makes that promotion safe.
--
-- CONTENT-ADDRESSED, LIKE THE PIPELINE. `storage_path` embeds the sha256 of
-- the ORIGINAL bytes (wp/<aa>/<sha256><suffix>.<ext>, the 06-media-sync
-- scheme), so an image referenced by many products is one object and an
-- interrupted run re-derives identical keys. `source_url` is the unique key of
-- the ledger because it is the identity of the WAITING item: the same bytes
-- under two source URLs are two rows pointing at one object.
--
-- NO CLIENT ACCESS. Rows are written by the ingest script (service role via
-- MCP) and read by admin tooling later. Shoppers see URLs inside
-- products.images and metadata via media_assets; nothing client-side reads
-- this table, so RLS is on with zero policies and privileges are revoked
-- outright (the 122/172 pattern).
--
-- ROLLBACK:
--   drop trigger if exists trg_media_ingest_queue_updated_at on public.media_ingest_queue;
--   drop table if exists public.media_ingest_queue;

create table if not exists public.media_ingest_queue (
  id               uuid primary key default gen_random_uuid(),

  -- identity of the waiting item
  source_url       text not null unique,
  source_kind      text not null check (source_kind in ('wp_attachment', 'catalogue', 'admin_upload')),
  wp_attachment_id bigint,

  -- identity of the bytes, once we have them
  sha256           text check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size        integer check (byte_size is null or byte_size >= 0),
  mime_type        text,
  width            integer,
  height           integer,

  -- where the object lives now
  status           text not null default 'pending'
                     check (status in ('pending', 'ingested', 'unreachable', 'failed')),
  storage          text check (storage in ('r2', 'local', 'supabase')),
  bucket           text,
  storage_path     text,

  -- the next/image-ready URL set (main / card / thumb / og, the derivative
  -- family 06-media-sync produces)
  public_url       text,
  card_url         text,
  thumb_url        text,
  og_url           text,
  og_jpg_url       text,

  alt_he           text,
  error            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.media_ingest_queue is
  'Media ingest ledger (ARCHITECTURE-MEDIA-R2): every image the platform should host itself, its bytes'' sha256, and where the object currently lives (r2 / local fallback / supabase).';

-- sha256 is how "are these bytes already stored" is asked; status is how
-- "what is still waiting" is asked. Neither is unique: many source URLs may
-- share bytes, many rows share a status.
create index if not exists media_ingest_queue_sha256_idx on public.media_ingest_queue (sha256);
create index if not exists media_ingest_queue_status_idx on public.media_ingest_queue (status);

-- Same set_updated_at the rest of the schema uses (049 defined it; the live
-- body is the authority, this file only attaches it).
drop trigger if exists trg_media_ingest_queue_updated_at on public.media_ingest_queue;
create trigger trg_media_ingest_queue_updated_at
  before update on public.media_ingest_queue
  for each row execute function public.set_updated_at();

alter table public.media_ingest_queue enable row level security;

revoke all on public.media_ingest_queue from anon, authenticated;
