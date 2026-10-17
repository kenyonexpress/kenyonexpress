/**
 * Deep-link path extraction from notifications.
 * Shared between web and mobile apps. Mobile app imports this.
 */

export type NotificationResponse = {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>
      }
    }
  }
}

/**
 * Extract the in-app destination from a notification.
 * Only returns in-app paths (starting with /, not //).
 * Returns null for missing, invalid, or URL-like paths.
 */
export function pathFromNotification(response: NotificationResponse | null): string | null {
  const data = response?.notification.request.content.data as { path?: unknown } | undefined
  const path = data?.path
  // Only in-app paths. A notification must never be able to steer the app to an
  // arbitrary URL, and `//evil.test` is a path by any naive check.
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null
  return path
}
