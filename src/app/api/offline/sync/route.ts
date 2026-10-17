import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, payload } = body

    if (!action || !payload) {
      return NextResponse.json({ error: 'Invalid sync request' }, { status: 400 })
    }

    // Process different sync actions
    switch (action) {
      case 'add_to_cart':
        return await handleAddToCart(payload)
      case 'remove_from_cart':
        return await handleRemoveFromCart(payload)
      case 'update_quantity':
        return await handleUpdateQuantity(payload)
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

async function handleAddToCart(payload: unknown) {
  const { product_id, quantity, price_agonot } = payload as Record<string, unknown>

  if (!product_id || !quantity || price_agonot === undefined) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Cart mutations are handled server-side via the main cart API
  // This sync endpoint just validates the request is well-formed
  return NextResponse.json({ success: true })
}

async function handleRemoveFromCart(payload: unknown) {
  const { product_id } = payload as Record<string, unknown>

  if (!product_id) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

async function handleUpdateQuantity(payload: unknown) {
  const { product_id, quantity } = payload as Record<string, unknown>

  if (!product_id || quantity === undefined) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
