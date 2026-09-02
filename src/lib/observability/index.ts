/**
 * Single entry point for the instrumentation trio: Sentry init, PostHog init,
 * and the typed trackEvent. Everything re-exported here is guarded by its env
 * variable and safe to import from server and client code alike.
 *
 * Nothing existing imports the bare directory, so this file adds a path
 * without changing the resolution of any current import.
 */

export { initSentry } from './sentry'
export { initPostHog, isPostHogEnabled, trackEvent } from './posthog'
export type { EventProperties, TrackOptions } from './posthog'
