# ARCHITECTURE-WISHLIST.md

KenyonExpress wishlist architecture (binding). 1:1 electro / live YITH Wishlist UX.

Status: BINDING for `arch/wishlist-compare` (2026-07-30)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch-wishlist` only. **Documentation only.**
Stack: Next.js App Router, Supabase Postgres + RLS, Hebrew RTL, Heebo, guest `localStorage` + login merge (same moment as `mergeGuestCart`).
Companions: live masthead Heart → `/wishlist` (`MastheadNav.tsx`), footer `מועדפים`, PDP measured YITH link text `הוסף למועדפים` (`docs/coupon-page-measured.md`), cart merge in `src/server/actions/cart.ts`.

Live WP uses **YITH WooCommerce Wishlist**. This doc replaces that plugin with first-party tables and UI that keep the electro rhythm: heart on cards, header counter, wishlist page, PDP link-style add.

**Product compare** (YITH Compare / electro compare bar) is **out of scope** here. Branch name `wishlist-compare` reserves the topic; ship wishlist first. Compare gets a sibling doc if needed.

Confirm App Router APIs against `node_modules/next/dist/docs/` before shipping.

---

## 0. Non-negotiables

1. Wishlist is **not money**. Prices on the page are display-only; checkout re-resolves agorot from DB.
2. Authenticated source of truth = Postgres (`wishlists` + `wishlist_items`) behind RLS.
3. Guest source of truth = `localStorage` only (no guest cookie / no guest DB row). Merge into the user list on login / auth callback.
4. One default list per user in v1 (YITH “default wishlist”). No public share URLs in v1.
5. Cap **100** products per wishlist (guest and auth). Silent drop of oldest when over cap on add, or reject with Hebrew error (prefer reject).
6. Only **published / active** catalog products appear on the wishlist page. Orphan IDs are pruned on read.
7. `/wishlist` is `noindex`. Dynamic for auth; guest is client-rendered list.
8. RTL everywhere: logical Tailwind (`ps`/`pe`/`start`/`end`), Hebrew copy only.
9. Do not import YITH CSS/JS. Match measured slots and labels.

Hebrew UI strings (binding):

| Slot | Copy |
|---|---|
| Header aria | `מועדפים` |
| PDP / card add | `הוסף למועדפים` |
| PDP / card remove | `הסר ממועדפים` |
| Page H1 | `רשימת מועדפים` |
| Empty | `עדיין אין מוצרים במועדפים` |
| CTA empty | `להמשך קניות` |
| Added toast (optional) | `נוסף למועדפים` |

---

## 1. Live / electro parity map

| Live (YITH / electro) | KenyonExpress |
|---|---|
| Header heart icon → wishlist | `MastheadNav` Heart → `/wishlist` + **count badge** (new) |
| Loop product hover heart | Heart button on `ProductCard` image corner |
| PDP `yith-wcwl-add-to-wishlist--link-style` text `הוסף למועדפים` | Link-style button under buy controls in `ProductInfo` |
| Wishlist page grid of products | `/wishlist` product grid (reuse card) |
| Guest cookie list (YITH) | **`localStorage`** key `ke_wishlist` (simpler CSP; no Set-Cookie bloat) |
| Merge on login | `mergeGuestWishlist(userId)` next to `mergeGuestCart` |
| Multiple named lists | **Deferred.** One default list named `מועדפים` |
| Share wishlist URL | Deferred |
| Stock / price alerts from wishlist | Deferred (needs price history; see marketing notifications) |

Measured PDP wishlist chrome (live): ~13px, color `#333e48`, link style, label `הוסף למועדפים`, sits in `.action-buttons` beside buy flow.

---

## 2. Data model

### 2.1 SQL migration (full)

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_wishlists.sql
-- Idempotent draft. Adjust number to next free migration.

CREATE TABLE IF NOT EXISTS public.wishlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name_he     text NOT NULL DEFAULT 'מועדפים',
  is_default  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- v1: exactly one wishlist row per user
CREATE UNIQUE INDEX IF NOT EXISTS wishlists_one_per_user_uidx
  ON public.wishlists (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS wishlists_one_default_per_user_uidx
  ON public.wishlists (user_id)
  WHERE is_default;

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id  uuid NOT NULL REFERENCES public.wishlists (id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  added_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlist_items_unique_product UNIQUE (wishlist_id, product_id)
);

CREATE INDEX IF NOT EXISTS wishlist_items_wishlist_added_idx
  ON public.wishlist_items (wishlist_id, added_at DESC);

CREATE INDEX IF NOT EXISTS wishlist_items_product_idx
  ON public.wishlist_items (product_id);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

-- Owner-only. No anon policies: guests never hit these tables.

CREATE POLICY wishlists_select_own ON public.wishlists
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY wishlists_insert_own ON public.wishlists
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY wishlists_update_own ON public.wishlists
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY wishlists_delete_own ON public.wishlists
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY wishlist_items_select_own ON public.wishlist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_id AND w.user_id = auth.uid()
    )
  );

CREATE POLICY wishlist_items_insert_own ON public.wishlist_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_id AND w.user_id = auth.uid()
    )
  );

CREATE POLICY wishlist_items_delete_own ON public.wishlist_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_id AND w.user_id = auth.uid()
    )
  );

-- updated_at bump
CREATE OR REPLACE FUNCTION public.tg_wishlists_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wishlists_touch ON public.wishlists;
CREATE TRIGGER wishlists_touch
  BEFORE UPDATE ON public.wishlists
  FOR EACH ROW EXECUTE FUNCTION public.tg_wishlists_touch();

CREATE OR REPLACE FUNCTION public.tg_wishlist_items_touch_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wishlists
  SET updated_at = now()
  WHERE id = COALESCE(NEW.wishlist_id, OLD.wishlist_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS wishlist_items_touch_parent ON public.wishlist_items;
CREATE TRIGGER wishlist_items_touch_parent
  AFTER INSERT OR DELETE ON public.wishlist_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_wishlist_items_touch_parent();
```

Service role is used only for merge (same pattern as guest cart) when the session client cannot see the pre-login guest payload (guest payload is client-sent).

### 2.2 Ensure default wishlist

```sql
CREATE OR REPLACE FUNCTION public.ensure_default_wishlist(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.wishlists WHERE user_id = p_user_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.wishlists (user_id, name_he, is_default)
  VALUES (p_user_id, 'מועדפים', true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_wishlist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_wishlist(uuid) TO authenticated, service_role;
```

---

## 3. Guest localStorage contract

```ts
// src/lib/wishlist/guest-storage.ts
export const WISHLIST_STORAGE_KEY = 'ke_wishlist'
export const WISHLIST_MAX_ITEMS = 100

export type GuestWishlistV1 = {
  v: 1
  /** Product UUIDs, newest last (or first: pick one and stick to it). */
  productIds: string[]
  updatedAt: string
}

export function emptyGuestWishlist(): GuestWishlistV1 {
  return { v: 1, productIds: [], updatedAt: new Date().toISOString() }
}

export function parseGuestWishlist(raw: string | null): GuestWishlistV1 {
  if (!raw) return emptyGuestWishlist()
  try {
    const data = JSON.parse(raw) as GuestWishlistV1
    if (data?.v !== 1 || !Array.isArray(data.productIds)) return emptyGuestWishlist()
    const productIds = data.productIds
      .filter((id) => typeof id === 'string' && id.length > 0)
      .slice(0, WISHLIST_MAX_ITEMS)
    return { v: 1, productIds, updatedAt: data.updatedAt ?? new Date().toISOString() }
  } catch {
    return emptyGuestWishlist()
  }
}

export function readGuestWishlist(): GuestWishlistV1 {
  if (typeof window === 'undefined') return emptyGuestWishlist()
  return parseGuestWishlist(window.localStorage.getItem(WISHLIST_STORAGE_KEY))
}

export function writeGuestWishlist(next: GuestWishlistV1): void {
  const payload: GuestWishlistV1 = {
    v: 1,
    productIds: [...new Set(next.productIds)].slice(0, WISHLIST_MAX_ITEMS),
    updatedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(payload))
  window.dispatchEvent(new CustomEvent('ke:wishlist-changed', { detail: payload }))
}

export function clearGuestWishlist(): void {
  window.localStorage.removeItem(WISHLIST_STORAGE_KEY)
  window.dispatchEvent(
    new CustomEvent('ke:wishlist-changed', { detail: emptyGuestWishlist() }),
  )
}
```

Why localStorage (not cookie like cart session):

- Wishlist IDs are not needed on the server for SSR of public pages.
- Avoids cookie growth and middleware cost.
- Merge sends the ID list once at login (explicit body), same security posture as trusting the browser for guest cart until auth.

---

## 4. Domain types + view model

```ts
// src/lib/wishlist/types.ts
export type WishlistProductCard = {
  id: string
  slug: string
  name_he: string
  /** Display ₪ from catalog; not a checkout quote. */
  displayPriceIls: number | null
  compareAtIls: number | null
  imageUrl: string | null
  inStock: boolean
  productType: 'coupon' | 'physical' | string
}

export type WishlistView = {
  productIds: string[]
  count: number
  products: WishlistProductCard[]
  source: 'guest' | 'user'
}
```

```ts
// src/lib/wishlist/map-product.ts
import type { WishlistProductCard } from './types'

type ProductRow = {
  id: string
  slug: string
  name_he: string
  status: string
  product_type: string
  stock_quantity: number | null
  coupon_price_ils: number | null
  price_ils: number | null
  discount_percent: number | null
  images: unknown
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null
  const first = images[0]
  if (typeof first === 'string') return first
  if (first && typeof first === 'object' && 'url' in first) {
    const url = (first as { url?: unknown }).url
    return typeof url === 'string' ? url : null
  }
  return null
}

export function toWishlistCard(row: ProductRow): WishlistProductCard | null {
  // Adjust status enum to live catalog (`published` / `active`).
  if (row.status !== 'published' && row.status !== 'active') return null

  let display: number | null = null
  let compare: number | null = null
  if (row.product_type === 'coupon') {
    display = row.coupon_price_ils
    compare = row.price_ils
  } else {
    const base = row.price_ils
    if (base != null && row.discount_percent != null && row.discount_percent > 0) {
      display = Math.round(base * (1 - row.discount_percent / 100) * 100) / 100
      compare = base
    } else {
      display = base
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    name_he: row.name_he,
    displayPriceIls: display,
    compareAtIls: compare,
    imageUrl: firstImage(row.images),
    inStock: (row.stock_quantity ?? 1) > 0,
    productType: row.product_type,
  }
}
```

---

## 5. Server actions (authenticated)

```ts
// src/server/actions/wishlist.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WISHLIST_MAX_ITEMS } from '@/lib/wishlist/guest-storage'
import { toWishlistCard } from '@/lib/wishlist/map-product'
import type { WishlistView } from '@/lib/wishlist/types'
import { z } from 'zod'

const productIdSchema = z.string().uuid()

export type WishlistActionResult =
  | { ok: true; view: WishlistView }
  | { ok: false; error: string; code: string }

function fail(error: string, code: string): WishlistActionResult {
  return { ok: false, error, code }
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

async function getOrCreateWishlistId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_default_wishlist', {
    p_user_id: userId,
  })
  if (error || !data) throw new Error(error?.message ?? 'wishlist ensure failed')
  return data as string
}

const PRODUCT_SELECT = `
  id, slug, name_he, status, product_type, stock_quantity,
  coupon_price_ils, price_ils, discount_percent, images
` as const

export async function getWishlistView(): Promise<WishlistView> {
  const { supabase, user } = await requireUser()
  if (!user) {
    return { productIds: [], count: 0, products: [], source: 'guest' }
  }

  const wishlistId = await getOrCreateWishlistId(supabase, user.id)
  const { data: items } = await supabase
    .from('wishlist_items')
    .select(`product_id, added_at, products(${PRODUCT_SELECT})`)
    .eq('wishlist_id', wishlistId)
    .order('added_at', { ascending: false })

  const productIds: string[] = []
  const products = []
  for (const row of items ?? []) {
    const p = Array.isArray(row.products) ? row.products[0] : row.products
    if (!p) continue
    const card = toWishlistCard(p as Parameters<typeof toWishlistCard>[0])
    if (!card) continue
    productIds.push(card.id)
    products.push(card)
  }

  return { productIds, count: productIds.length, products, source: 'user' }
}

export async function toggleWishlistItem(productIdRaw: string): Promise<WishlistActionResult> {
  const parsed = productIdSchema.safeParse(productIdRaw)
  if (!parsed.success) return fail('מוצר לא תקין', 'VALIDATION')

  const { supabase, user } = await requireUser()
  if (!user) return fail('יש להתחבר', 'UNAUTHENTICATED')

  const wishlistId = await getOrCreateWishlistId(supabase, user.id)
  const productId = parsed.data

  const { data: existing } = await supabase
    .from('wishlist_items')
    .select('id')
    .eq('wishlist_id', wishlistId)
    .eq('product_id', productId)
    .maybeSingle()

  if (existing) {
    await supabase.from('wishlist_items').delete().eq('id', existing.id)
  } else {
    const { count } = await supabase
      .from('wishlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('wishlist_id', wishlistId)

    if ((count ?? 0) >= WISHLIST_MAX_ITEMS) {
      return fail('הגעתם למגבלת 100 מוצרים במועדפים', 'CAP')
    }

    // Ensure product exists and is listable
    const { data: product } = await supabase
      .from('products')
      .select('id, status')
      .eq('id', productId)
      .maybeSingle()
    if (!product || (product.status !== 'published' && product.status !== 'active')) {
      return fail('המוצר לא זמין', 'NOT_FOUND')
    }

    const { error } = await supabase.from('wishlist_items').insert({
      wishlist_id: wishlistId,
      product_id: productId,
    })
    if (error) return fail('לא ניתן להוסיף למועדפים', 'DB')
  }

  revalidatePath('/wishlist')
  const view = await getWishlistView()
  return { ok: true, view }
}

export async function removeWishlistItem(productIdRaw: string): Promise<WishlistActionResult> {
  const parsed = productIdSchema.safeParse(productIdRaw)
  if (!parsed.success) return fail('מוצר לא תקין', 'VALIDATION')

  const { supabase, user } = await requireUser()
  if (!user) return fail('יש להתחבר', 'UNAUTHENTICATED')

  const wishlistId = await getOrCreateWishlistId(supabase, user.id)
  await supabase
    .from('wishlist_items')
    .delete()
    .eq('wishlist_id', wishlistId)
    .eq('product_id', parsed.data)

  revalidatePath('/wishlist')
  return { ok: true, view: await getWishlistView() }
}

/**
 * Called from auth callback / signIn after mergeGuestCart.
 * Guest IDs arrive from the client (localStorage); server merges with UNION semantics.
 */
export async function mergeGuestWishlist(
  userId: string,
  guestProductIds: string[],
): Promise<void> {
  const ids = [...new Set(guestProductIds.filter((id) => productIdSchema.safeParse(id).success))]
  if (ids.length === 0) return

  const admin = createAdminClient()
  const { data: wishlistId, error: ensureError } = await admin.rpc('ensure_default_wishlist', {
    p_user_id: userId,
  })
  if (ensureError || !wishlistId) {
    console.error('ensure_default_wishlist failed', ensureError?.message)
    return
  }

  const { data: existing } = await admin
    .from('wishlist_items')
    .select('product_id')
    .eq('wishlist_id', wishlistId)

  const have = new Set((existing ?? []).map((r) => r.product_id as string))
  const toInsert = ids.filter((id) => !have.has(id))
  const room = Math.max(0, WISHLIST_MAX_ITEMS - have.size)
  const batch = toInsert.slice(0, room)

  if (batch.length === 0) return

  // Only insert IDs that still exist as listable products
  const { data: products } = await admin
    .from('products')
    .select('id, status')
    .in('id', batch)

  const ok = new Set(
    (products ?? [])
      .filter((p) => p.status === 'published' || p.status === 'active')
      .map((p) => p.id as string),
  )

  const rows = batch.filter((id) => ok.has(id)).map((product_id) => ({
    wishlist_id: wishlistId as string,
    product_id,
  }))

  if (rows.length) {
    await admin.from('wishlist_items').upsert(rows, {
      onConflict: 'wishlist_id,product_id',
      ignoreDuplicates: true,
    })
  }
}
```

### 5.1 Wire merge into auth (alongside cart)

```ts
// src/server/actions/auth.ts (excerpt)
import { mergeGuestCart } from '@/server/actions/cart'
import { mergeGuestWishlist } from '@/server/actions/wishlist'

// after successful sign-in:
await mergeGuestCart(signInData.user.id, sessionId)
// guest wishlist IDs must be passed from the client form / login action:
await mergeGuestWishlist(signInData.user.id, guestWishlistProductIds)
```

```ts
// src/app/auth/callback/route.ts cannot read localStorage.
// Pattern: login client action reads localStorage, passes IDs into signIn server action,
// then clearGuestWishlist() on the client after ok.
```

```ts
// src/lib/wishlist/login-merge-client.ts
'use client'

import { clearGuestWishlist, readGuestWishlist } from './guest-storage'

export function takeGuestWishlistIdsForMerge(): string[] {
  const ids = readGuestWishlist().productIds
  return ids
}

export function afterWishlistMerged(): void {
  clearGuestWishlist()
}
```

For OAuth callback-only flows: on first authenticated store layout mount, client calls a one-shot Server Action `mergeGuestWishlistFromClient(ids)` then clears storage (idempotent upsert).

```ts
// src/server/actions/wishlist.ts (add)
export async function mergeGuestWishlistFromClient(
  guestProductIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }
  await mergeGuestWishlist(user.id, guestProductIds)
  revalidatePath('/wishlist')
  return { ok: true }
}
```

```tsx
// src/components/wishlist/WishlistMergeOnAuth.tsx
'use client'

import { useEffect, useRef } from 'react'
import { mergeGuestWishlistFromClient } from '@/server/actions/wishlist'
import { afterWishlistMerged, takeGuestWishlistIdsForMerge } from '@/lib/wishlist/login-merge-client'
import { useRouter } from 'next/navigation'

export function WishlistMergeOnAuth({ isAuthenticated }: { isAuthenticated: boolean }) {
  const ran = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated || ran.current) return
    const ids = takeGuestWishlistIdsForMerge()
    if (ids.length === 0) return
    ran.current = true
    void mergeGuestWishlistFromClient(ids).then((res) => {
      if (res.ok) {
        afterWishlistMerged()
        router.refresh()
      }
    })
  }, [isAuthenticated, router])

  return null
}
```

---

## 6. Client provider + header counter

Mirror `CartProvider` / `CartNavLink`.

```tsx
// src/components/wishlist/WishlistProvider.tsx
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react'
import {
  readGuestWishlist,
  writeGuestWishlist,
  WISHLIST_MAX_ITEMS,
  type GuestWishlistV1,
} from '@/lib/wishlist/guest-storage'
import { toggleWishlistItem, getWishlistView } from '@/server/actions/wishlist'
import type { WishlistView } from '@/lib/wishlist/types'

type WishlistContextValue = {
  productIds: Set<string>
  count: number
  isPending: boolean
  isAuthenticated: boolean
  has: (productId: string) => boolean
  toggle: (productId: string) => Promise<void>
  refresh: () => Promise<void>
}

const WishlistContext = createContext<WishlistContextValue | null>(null)

export function WishlistProvider({
  isAuthenticated,
  initialUserView,
  children,
}: {
  isAuthenticated: boolean
  initialUserView?: WishlistView | null
  children: React.ReactNode
}) {
  const [guest, setGuest] = useState<GuestWishlistV1>(() =>
    typeof window === 'undefined' ? { v: 1, productIds: [], updatedAt: '' } : readGuestWishlist(),
  )
  const [userIds, setUserIds] = useState<string[]>(
    () => initialUserView?.productIds ?? [],
  )
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (isAuthenticated) return
    const sync = () => setGuest(readGuestWishlist())
    sync()
    window.addEventListener('ke:wishlist-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('ke:wishlist-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [isAuthenticated])

  const productIds = useMemo(() => {
    const list = isAuthenticated ? userIds : guest.productIds
    return new Set(list)
  }, [isAuthenticated, userIds, guest.productIds])

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setGuest(readGuestWishlist())
      return
    }
    const view = await getWishlistView()
    setUserIds(view.productIds)
  }, [isAuthenticated])

  const toggle = useCallback(
    async (productId: string) => {
      if (!isAuthenticated) {
        const current = readGuestWishlist()
        const set = new Set(current.productIds)
        if (set.has(productId)) set.delete(productId)
        else {
          if (set.size >= WISHLIST_MAX_ITEMS) return
          set.add(productId)
        }
        writeGuestWishlist({ v: 1, productIds: [...set], updatedAt: new Date().toISOString() })
        setGuest(readGuestWishlist())
        return
      }

      startTransition(() => {
        void toggleWishlistItem(productId).then((res) => {
          if (res.ok) setUserIds(res.view.productIds)
        })
      })
    },
    [isAuthenticated],
  )

  const value: WishlistContextValue = {
    productIds,
    count: productIds.size,
    isPending,
    isAuthenticated,
    has: (id) => productIds.has(id),
    toggle,
    refresh,
  }

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist requires WishlistProvider')
  return ctx
}
```

```tsx
// src/components/wishlist/WishlistNavLink.tsx
'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'
import { useWishlist } from './WishlistProvider'

const ICON = { size: 22, color: 'var(--color-icon)', strokeWidth: 1.8 } as const

export default function WishlistNavLink() {
  const { count, isPending } = useWishlist()
  const label = count > 0 ? `מועדפים, ${count} מוצרים` : 'מועדפים'

  return (
    <Link
      href="/wishlist"
      aria-label={label}
      className={`relative transition-opacity hover:opacity-70 ${isPending ? 'opacity-70' : ''}`}
      style={{ color: ICON.color }}
    >
      <Heart
        size={ICON.size}
        strokeWidth={ICON.strokeWidth}
        aria-hidden="true"
        className={count > 0 ? 'fill-brand-primary text-brand-primary' : undefined}
      />
      {count > 0 ? (
        <span
          className="absolute -top-1.5 -start-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-nano font-bold text-brand-dark"
          aria-hidden="true"
        >
          {count > 99 ? '99+' : count}
        </span>
      ): null}
    </Link>
  )
}
```

Replace the plain Heart `Link` in
`MastheadNav.tsx`
with
`WishlistNavLink`.

---

## 7. Heart on product card + PDP

```tsx
// src/components/wishlist/WishlistHeartButton.tsx
'use client'

import { Heart } from 'lucide-react'
import { useWishlist } from './WishlistProvider'

export function WishlistHeartButton({
  productId,
  variant = 'icon',
}: {
  productId: string
  variant?: 'icon' | 'link'
}) {
  const { has, toggle, isPending } = useWishlist()
  const active = has(productId)

  if (variant === 'link') {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => void toggle(productId)}
        className="text-[13px] leading-[18px] text-heading underline-offset-2 hover:underline"
      >
        {active ? 'הסר ממועדפים' : 'הוסף למועדפים'}
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void toggle(productId)
      }}
      aria-label={active ? 'הסר ממועדפים' : 'הוסף למועדפים'}
      aria-pressed={active}
      className="absolute top-2 end-2 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 text-heading shadow-sm transition hover:bg-white"
    >
      <Heart
        size={18}
        strokeWidth={1.8}
        className={active ? 'fill-brand-primary text-brand-primary' : undefined}
        aria-hidden="true"
      />
    </button>
  )
}
```

Product card placement (inside `p_con__image-wrap relative`):

```tsx
<div className="p_con__image-wrap relative">
  <Link href={`/product/${product.slug}`} className="p_con__image-link">
    {/* image */}
  </Link>
  <WishlistHeartButton productId={product.id} variant="icon" />
  {/* badges */}
</div>
```

PDP (`ProductInfo`) action row: render
`WishlistHeartButton productId={productId} variant="link"`
in the measured action-buttons slot (after ATC), RTL `ms` spacing ~10px equivalent via `ms-2.5`.

---

## 8. Wishlist page

```tsx
// src/app/(store)/wishlist/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getWishlistView } from '@/server/actions/wishlist'
import { WishlistPageClient } from '@/components/wishlist/WishlistPageClient'

export const metadata: Metadata = {
  title: 'רשימת מועדפים',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function WishlistPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const initial = user ? await getWishlistView(): null

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-heading">רשימת מועדפים</h1>
      <WishlistPageClient isAuthenticated={Boolean(user)} initialUserView={initial} />
      {!user ? (
        <p className="mt-4 text-sm text-black/60">
          המועדפים נשמרים במכשיר זה. לאחר{' '}
          <Link href="/login" className="underline">
            התחברות
          </Link>{' '}
          הם יסונכרנו לחשבון.
        </p>
      ): null}
    </main>
  )
}
```

```tsx
// src/components/wishlist/WishlistPageClient.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ProductCard from '@/components/ProductCard'
import { readGuestWishlist } from '@/lib/wishlist/guest-storage'
import type { WishlistProductCard, WishlistView } from '@/lib/wishlist/types'
import { useWishlist } from './WishlistProvider'
import { WishlistHeartButton } from './WishlistHeartButton'

async function fetchGuestProducts(ids: string[]): Promise<WishlistProductCard[]> {
  if (ids.length === 0) return []
  const res = await fetch('/api/wishlist/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds: ids }),
  })
  if (!res.ok) return []
  const data = (await res.json()) as { products: WishlistProductCard[] }
  return data.products
}

export function WishlistPageClient({
  isAuthenticated,
  initialUserView,
}: {
  isAuthenticated: boolean
  initialUserView: WishlistView | null
}) {
  const { productIds, count } = useWishlist()
  const [products, setProducts] = useState<WishlistProductCard[]>(
    initialUserView?.products ?? [],
  )
  const [loading, setLoading] = useState(!isAuthenticated)

  useEffect(() => {
    if (isAuthenticated) {
      setProducts(initialUserView?.products ?? [])
      return
    }
    const ids = readGuestWishlist().productIds
    setLoading(true)
    void fetchGuestProducts(ids).then((rows) => {
      setProducts(rows)
      setLoading(false)
    })
  }, [isAuthenticated, initialUserView, count, productIds])

  if (loading) {
    return <p className="mt-8 text-black/50">טוען…</p>
  }

  if (products.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-start gap-4">
        <p className="text-black/60">עדיין אין מוצרים במועדפים</p>
        <Link
          href="/"
          className="rounded-md bg-brand-primary px-4 py-2 font-bold text-heading"
        >
          להמשך קניות
        </Link>
      </div>
    )
  }

  return (
    <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="relative">
          <ProductCard
            product={{
              id: p.id,
              slug: p.slug,
              name_he: p.name_he,
              kenyon_price: p.displayPriceIls,
              full_price: p.compareAtIls,
              images: p.imageUrl ? [p.imageUrl] : [],
              stock_quantity: p.inStock ? 1 : 0,
            }}
          />
          <div className="mt-2">
            <WishlistHeartButton productId={p.id} variant="link" />
          </div>
        </li>
      ))}
    </ul>
  )
}
```

Guest product hydrate API (anon + RLS-safe product read):

```ts
// src/app/api/wishlist/products/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAnonClient } from '@/lib/supabase/anon'
import { toWishlistCard } from '@/lib/wishlist/map-product'
import { WISHLIST_MAX_ITEMS } from '@/lib/wishlist/guest-storage'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  productIds: z.array(z.string().uuid()).max(WISHLIST_MAX_ITEMS),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  const ids = [...new Set(parsed.data.productIds)]
  if (ids.length === 0) return NextResponse.json({ products: [] })

  const supabase = createAnonClient()
  const { data, error } = await supabase
    .from('products')
    .select(
      `id, slug, name_he, status, product_type, stock_quantity,
       coupon_price_ils, price_ils, discount_percent, images`,
    )
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byId = new Map(
    (data ?? [])
      .map((row) => toWishlistCard(row as Parameters<typeof toWishlistCard>[0]))
      .filter(Boolean)
      .map((c) => [c!.id, c!] as const),
  )

  // Preserve guest order
  const products = ids.map((id) => byId.get(id)).filter(Boolean)

  return NextResponse.json({ products })
}
```

If
`createAnonClient`
is not exported yet, use the existing public server helper that respects RLS for published products only.

---

## 9. Store layout wiring

```tsx
// src/app/(store)/layout.tsx (excerpt)
import { WishlistProvider } from '@/components/wishlist/WishlistProvider'
import { WishlistMergeOnAuth } from '@/components/wishlist/WishlistMergeOnAuth'
import { createClient } from '@/lib/supabase/server'
import { getWishlistView } from '@/server/actions/wishlist'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const initial = user ? await getWishlistView(): null

  return (
    <WishlistProvider isAuthenticated={Boolean(user)} initialUserView={initial}>
      <WishlistMergeOnAuth isAuthenticated={Boolean(user)} />
      {/* existing header / footer */}
      {children}
    </WishlistProvider>
  )
}
```

Performance: `getWishlistView` on every layout render is acceptable at low item counts; later cache product ids in a short cookie or React `cache()`.

---

## 10. RTL / CSS notes

1. Root already `dir="rtl"` `lang="he"`.
2. Badge on heart: `absolute -top-1.5 -start-2` (mirrors cart badge; start = right in RTL).
3. Card heart: `top-2 end-2` (end = left in RTL, matching electro heart often on the visual “outer” corner; verify against live card hover and flip to `start-2` if compare.mjs demands it).
4. PDP link: `text-start`, 13px, `#333e48` → `text-heading`.
5. No `ml-` / `mr-` / `left-` / `right-` in new wishlist components.

Optional CSS module for electro hover reveal:

```css
/* src/styles/wishlist.css */
.p_con__image-wrap .wishlist-heart {
  opacity: 1;
}
@media (hover: hover) {
  .p_con__image-wrap .wishlist-heart {
    opacity: 0;
  }
  .p_con__image-wrap:hover .wishlist-heart,
  .p_con__image-wrap:focus-within .wishlist-heart {
    opacity: 1;
  }
}
```

Only enable hover-hide if live cards do the same; otherwise keep always-visible for mobile parity.

---

## 11. SEO / caching / robots

```ts
// metadata on /wishlist
robots: { index: false, follow: false }
```

Do not put wishlist HTML in public ISR. Guest page is client-hydrated; auth page `force-dynamic`.

Sitemap: exclude `/wishlist`.

---

## 12. WP / YITH migration (optional cutover)

| WP | Action |
|---|---|
| `wp_yith_wcwl_lists` / item tables | One-time script: map WP user email → `auth.users`, WP product SKU/ID → `products.id`, insert into `wishlist_items` |
| Guest YITH cookies | Not migrated; users rebuild guest lists |
| YITH share tokens | Dropped in v1 |

Do not run YITH PHP on the Next domain.

---

## 13. Tests

```ts
// src/lib/wishlist/guest-storage.test.ts
import { describe, expect, it } from 'vitest'
import { parseGuestWishlist, WISHLIST_MAX_ITEMS } from './guest-storage'

describe('parseGuestWishlist', () => {
  it('dedupes and caps on write path via parse', () => {
    const ids = Array.from({ length: WISHLIST_MAX_ITEMS + 5 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    const parsed = parseGuestWishlist(
      JSON.stringify({ v: 1, productIds: ids, updatedAt: '2026-01-01' }),
    )
    expect(parsed.productIds.length).toBe(WISHLIST_MAX_ITEMS)
  })

  it('returns empty on garbage', () => {
    expect(parseGuestWishlist('{nope').productIds).toEqual([])
  })
})
```

```ts
// src/server/actions/wishlist.merge.test.ts
import { describe, expect, it, vi } from 'vitest'

// Unit-test merge set logic in a pure helper extracted from mergeGuestWishlist:
export function mergeIdLists(userIds: string[], guestIds: string[], max: number): string[] {
  const out = [...userIds]
  const have = new Set(userIds)
  for (const id of guestIds) {
    if (have.has(id)) continue
    if (out.length >= max) break
    out.push(id)
    have.add(id)
  }
  return out
}

describe('mergeIdLists', () => {
  it('unions without duplicates and respects cap', () => {
    expect(mergeIdLists(['a'], ['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
  })
})
```

E2E (Playwright): guest add → reload → still there; login → guest cleared → ids on `/wishlist`; header badge count.

---

## 14. Implementation checklist

1. Migration `wishlists` + `wishlist_items` + RLS + `ensure_default_wishlist`
2. `guest-storage` + provider + nav badge
3. Heart on `ProductCard` + PDP link button
4. `/wishlist` page + guest hydrate API
5. Merge on auth (`WishlistMergeOnAuth` + sign-in path)
6. Replace footer/masthead stubs with live counter behavior
7. Vitest + one Playwright flow
8. Visual check vs live YITH PDP link slot (compare.mjs product band)

---

## 15. Out of scope

- YITH multi-wishlist / share / waitlist / price-drop email
- Product **compare** bar (separate doc on this branch later if required)
- Server-side guest wishlist table
- Wishlist in admin analytics (optional later signal)

---

## 16. Revision

| Date | Change |
|---|---|
| 2026-07-30 | Initial binding wishlist architecture on `arch/wishlist-compare` |
