import { createAdminClient } from '@/lib/supabase/admin'

type CartItem = {
  product_id: string
  variant_id: string | null
  quantity: number
}

function itemKey(item: CartItem): string {
  return `${item.product_id}::${item.variant_id ?? 'null'}`
}

export async function mergeGuestCart(userId: string, sessionId: string): Promise<void> {
  const admin = createAdminClient()

  const [{ data: guestCart }, { data: userCart }] = await Promise.all([
    admin
      .from('carts')
      .select('id, items')
      .eq('session_id', sessionId)
      .is('profile_id', null)
      .maybeSingle(),
    admin.from('carts').select('id, items').eq('profile_id', userId).maybeSingle(),
  ])

  if (!guestCart || !Array.isArray(guestCart.items) || guestCart.items.length === 0) return

  const guestItems = guestCart.items as CartItem[]
  const userItems: CartItem[] = Array.isArray(userCart?.items) ? (userCart.items as CartItem[]) : []

  // Sum quantities for matching product + variant combinations
  const merged = new Map<string, CartItem>(userItems.map((item) => [itemKey(item), { ...item }]))
  for (const gItem of guestItems) {
    const key = itemKey(gItem)
    const existing = merged.get(key)
    if (existing) {
      existing.quantity += gItem.quantity
    } else {
      merged.set(key, { ...gItem })
    }
  }

  const mergedItems = [...merged.values()]

  await Promise.all([
    userCart?.id
      ? admin.from('carts').update({ items: mergedItems }).eq('id', userCart.id)
      : admin.from('carts').insert({ profile_id: userId, items: mergedItems }),
    admin.from('carts').delete().eq('id', guestCart.id),
  ])
}
