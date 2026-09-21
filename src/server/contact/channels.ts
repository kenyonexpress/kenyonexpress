import 'server-only'

import {
  CONTACT_CHANNELS_TAG,
  type ContactChannel,
  type ContactChannelKey,
  DEFAULT_CONTACT_CHANNELS,
  DEFAULT_PAGE_CONTACT_CONFIGS,
  type PageContactConfig,
  activeChannels,
  isContactChannelKey,
} from '@/lib/contact/channels'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Contact channels as the server reads them: the table when it exists, the
 * code defaults when it does not (236 is pending) or when the read fails.
 *
 * The storefront read is a `use cache` scope on the ANON client, tagged, for
 * two reasons that are really one: the float and the footer sit in layouts
 * that are prerendered, and cacheComponents refuses runtime data there; and
 * the tables' RLS is "public read of active rows", which is exactly the set
 * a visitor should see. The admin page reads uncached on the service key so
 * it sees inactive rows too. Writes `updateTag(CONTACT_CHANNELS_TAG)`.
 */
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST106'])

type ChannelRow = {
  key: string
  label_he: string
  number: string | null
  message_he: string
  sort_order: number
  active: boolean
}
type ConfigRow = {
  route_template: string
  channel_key: string
  message_he: string | null
  active: boolean
}

export interface ContactSnapshot {
  channels: ContactChannel[]
  configs: PageContactConfig[]
  source: 'table' | 'defaults'
}

function shape(channelRows: ChannelRow[], configRows: ConfigRow[]): ContactSnapshot {
  const channels = channelRows
    .filter((row) => isContactChannelKey(row.key))
    .map((row) => ({
      key: row.key as ContactChannelKey,
      labelHe: row.label_he,
      number: row.number,
      messageHe: row.message_he,
      sortOrder: Number(row.sort_order ?? 0),
      active: row.active === true,
    }))
  const configs = configRows
    .filter((row) => isContactChannelKey(row.channel_key))
    .map((row) => ({
      routeTemplate: row.route_template,
      channelKey: row.channel_key as ContactChannelKey,
      messageHe: row.message_he,
      active: row.active === true,
    }))
  return {
    // An applied-but-empty table still has to render a picker.
    channels: channels.length ? channels : [...DEFAULT_CONTACT_CHANNELS],
    configs: configs.length ? configs : [...DEFAULT_PAGE_CONTACT_CONFIGS],
    source: 'table',
  }
}

const DEFAULTS: ContactSnapshot = {
  channels: [...DEFAULT_CONTACT_CHANNELS],
  configs: [...DEFAULT_PAGE_CONTACT_CONFIGS],
  source: 'defaults',
}

async function readWith(
  client: ReturnType<typeof createPublicClient> | ReturnType<typeof createAdminClient>,
): Promise<ContactSnapshot> {
  const [channelsRead, configsRead] = await Promise.all([
    client
      .from('contact_channels' as never)
      .select('key, label_he, number, message_he, sort_order, active'),
    client
      .from('page_contact_config' as never)
      .select('route_template, channel_key, message_he, active'),
  ])
  const failed = channelsRead.error ?? configsRead.error
  if (failed) {
    if (!MISSING_TABLE.has(failed.code ?? '')) {
      log.warn('contact_channels.read_failed', { reason: failed.message, code: failed.code })
    }
    return DEFAULTS
  }
  return shape((channelsRead.data ?? []) as ChannelRow[], (configsRead.data ?? []) as ConfigRow[])
}

/** Storefront snapshot: cached, tagged, on the anon client (active rows only by RLS). */
async function storefrontSnapshot(): Promise<ContactSnapshot> {
  'use cache'
  cacheLife('hours')
  cacheTag(CONTACT_CHANNELS_TAG)
  return readWith(createPublicClient())
}

/** Every row, inactive included, uncached, for the admin page. */
export async function listContactChannelsForAdmin(): Promise<ContactSnapshot> {
  const snap = await readWith(createAdminClient())
  return { ...snap, channels: [...snap.channels].sort((a, b) => a.sortOrder - b.sortOrder) }
}

/** Active channels in order, for the storefront. */
export async function listActiveContactChannels(): Promise<ContactChannel[]> {
  return activeChannels((await storefrontSnapshot()).channels)
}

export async function listPageContactConfigs(): Promise<PageContactConfig[]> {
  return (await storefrontSnapshot()).configs
}

export async function findContactChannel(key: ContactChannelKey): Promise<ContactChannel | null> {
  return (await storefrontSnapshot()).channels.find((c) => c.key === key && c.active) ?? null
}
