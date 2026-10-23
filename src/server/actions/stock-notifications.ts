'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'

import { log } from '@/lib/observability/log'

type StockNotificationResult = { success: boolean; error?: string }

async function runSubscribeToStockNotification(
  productId: string,
  email?: string,
): Promise<StockNotificationResult> {
  try {
    const supabase = await createClient()
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user?.user?.id) {
      return { success: false, error: 'Not authenticated' }
    }

    const emailToUse = email || user.user.email
    if (!emailToUse) {
      return { success: false, error: 'Email required' }
    }

    // Get current stock level
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', productId)
      .single()

    if (productError || !product) {
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

async function runUnsubscribeFromStockNotification(
  notificationId: string,
): Promise<StockNotificationResult> {
  try {
    const supabase = await createClient()
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user?.user?.id) {
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

type StockSubscription = { subscribed: boolean; notificationId?: string }

async function runGetStockNotifications(productId: string): Promise<StockSubscription> {
  try {
    const supabase = await createClient()
    const { data: user, error: authError } = await supabase.auth.getUser()

    if (authError || !user?.user?.id) {
      return { subscribed: false }
    }

    const { data, error: readError } = await supabase
      .from('stock_notifications')
      .select('id')
      .eq('product_id', productId)
      .eq('user_id', user.user.id)
      .is('unsubscribed_at', null)
      .is('notified_at', null)
      .single()

    // PGRST116 is `.single()` finding no row: simply not subscribed.
    if (readError && readError.code !== 'PGRST116') {
      log.error('stock.get_notifications_read_failed', { error_message: readError.message })
    }

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

export async function subscribeToStockNotification(
  productId: string,
  email?: string,
): Promise<StockNotificationResult> {
  return withActionContext('stock.subscribe', () =>
    runSubscribeToStockNotification(productId, email),
  )
}

export async function unsubscribeFromStockNotification(
  notificationId: string,
): Promise<StockNotificationResult> {
  return withActionContext('stock.unsubscribe', () =>
    runUnsubscribeFromStockNotification(notificationId),
  )
}

export async function getStockNotifications(productId: string): Promise<StockSubscription> {
  return withActionContext('stock.get_notifications', () => runGetStockNotifications(productId))
}
