'use server'

import { createClient } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'

import { log } from '@/lib/observability/log'

export async function subscribeToStockNotification(
  productId: string,
  email?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: user } = await supabase.auth.getUser()

    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' }
    }

    const emailToUse = email || user.user.email
    if (!emailToUse) {
      return { success: false, error: 'Email required' }
    }

    // Get current stock level
    const { data: product } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', productId)
      .single()

    if (!product) {
      return { success: false, error: 'Product not found' }
    }

    // Insert notification subscription
    const { error } = await supabase
      .from('stock_notifications')
      .insert({
        user_id: user.user.id,
        product_id: productId,
        email: emailToUse,
        stock_level_when_registered: product.stock_quantity || 0,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Already subscribed to this product' }
      }
      log.error('stock.subscribe_failed', {
        user_id: user.user.id,
        product_id: productId,
        error_message: error.message,
      })
      return { success: false, error: 'Failed to subscribe' }
    }

    updateTag(`product_${productId}`)
    return { success: true }
  } catch (error) {
    log.error('stock.subscribe_error', {
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false, error: 'An error occurred' }
  }
}

export async function unsubscribeFromStockNotification(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: user } = await supabase.auth.getUser()

    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' }
    }

    // Soft delete by marking unsubscribed
    const { error } = await supabase
      .from('stock_notifications')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', user.user.id)

    if (error) {
      log.error('stock.unsubscribe_failed', {
        user_id: user.user.id,
        notification_id: notificationId,
        error_message: error.message,
      })
      return { success: false, error: 'Failed to unsubscribe' }
    }

    return { success: true }
  } catch (error) {
    log.error('stock.unsubscribe_error', {
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })
    return { success: false, error: 'An error occurred' }
  }
}

export async function getStockNotifications(
  productId: string,
): Promise<{ subscribed: boolean; notificationId?: string }> {
  try {
    const supabase = await createClient()
    const { data: user } = await supabase.auth.getUser()

    if (!user?.user?.id) {
      return { subscribed: false }
    }

    const { data } = await supabase
      .from('stock_notifications')
      .select('id')
      .eq('product_id', productId)
      .eq('user_id', user.user.id)
      .is('unsubscribed_at', null)
      .is('notified_at', null)
      .single()

    return {
      subscribed: !!data,
      notificationId: data?.id,
    }
  } catch (error) {
    log.error('stock.get_notifications_error', {
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })
    return { subscribed: false }
  }
}
