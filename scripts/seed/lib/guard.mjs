// scripts/seed/lib/guard.mjs
//
// Three gates between `node seed.mjs` and a write. A seed that inserts a
// hundred fake products into the live catalog is not a bug you can fix by
// deleting rows: the catalog is what customers see, and orders may already
// reference the fakes by the time anyone notices.
//
//   Gate 1 (static, this file): the URL names a host the seed is allowed to
//           write to. Local hosts pass. Remote hosts need --allow-remote.
//           Hosts on the production denylist pass never, with or without flags.
//   Gate 2 (runtime, this file): the connected database is asked whether it
//           holds activity this seed did not create. Real money (a settled
//           Cardcom payment, a redeemed voucher) is fatal and unbypassable.
//           Merely unfamiliar orders are refused but can be accepted with
//           --yes, because a shared dev database legitimately has some.
//   Gate 3 (steps): every write is an upsert keyed on an id inside the seed's
//           own UUID namespace, and --truncate only deletes ids in that
//           namespace. Even a seed that reached the wrong database cannot
//           delete a row it did not create.
//
// Gate 1 is bypassable by an operator who means it (--allow-remote to seed a
// staging project). The production denylist is not bypassable by any flag,
// because there is no legitimate reason to seed demo data into production, and
// a flag that exists will eventually be typed.

/**
 * Supabase project refs that must never be seeded: the kenyonexpress
 * production project. Not a secret, it appears throughout docs/ and in every
 * client-side Supabase URL.
 */
export const PRODUCTION_PROJECT_REFS = ['ixvwfbuvfxxsjiywhbbb']

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
  'host.docker.internal',
  'db', // the supabase/postgres service name inside docker compose
])

export class GuardError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GuardError'
  }
}

export function describeTarget(databaseUrl) {
  let url
  try {
    url = new URL(databaseUrl)
  } catch {
    throw new GuardError('--database-url is not a parseable URL')
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new GuardError(`--database-url must be a postgres:// URL, got "${url.protocol}//"`)
  }

  const host = url.hostname.toLowerCase()
  const database = url.pathname.replace(/^\//, '') || 'postgres'
  const isLocal = LOCAL_HOSTS.has(host) || host.endsWith('.local')

  // Supabase direct connections are db.<ref>.supabase.co; poolers put the ref
  // in the username instead (postgres.<ref>). Both are checked, because the
  // pooler URL is the one people copy out of the dashboard.
  const refs = new Set()
  const hostMatch = /^db\.([a-z0-9]{20})\.supabase\.(co|com)$/.exec(host)
  if (hostMatch) refs.add(hostMatch[1])
  const userMatch = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username || ''))
  if (userMatch) refs.add(userMatch[1])

  return {
    host,
    port: url.port || '5432',
    database,
    user: decodeURIComponent(url.username || ''),
    isLocal,
    projectRefs: [...refs],
    /** Safe to print: the password is not part of it. */
    label: `${url.username ? `${decodeURIComponent(url.username)}@` : ''}${host}:${url.port || '5432'}/${database}`,
  }
}

/** Gate 1. Throws unless this target may be written to. */
export function assertTargetAllowed(target, { allowRemote }) {
  const denied = target.projectRefs.filter((ref) => PRODUCTION_PROJECT_REFS.includes(ref))
  if (denied.length > 0) {
    throw new GuardError(
      `refusing to seed the production project (${denied.join(', ')}). ` +
        'This denylist is not overridable by any flag.',
    )
  }

  if (!target.isLocal && !allowRemote) {
    throw new GuardError(
      `${target.host} is not a local host. Pass --allow-remote to seed a remote ` +
        'development or staging database. Production stays denied regardless.',
    )
  }
}

/**
 * Gate 2. Reads the connected database and refuses if it carries the marks of
 * production. Every probe tolerates its table being absent, because a fresh
 * local database legitimately has fewer tables than the hosted one, and every
 * probe excludes the seed's own ids, because a second run must not be blocked
 * by the redeemed voucher the first run wrote.
 *
 * `ownedIds` is { orders: uuid[], vouchers: uuid[] }: the ids this run intends
 * to write, already computed because the fixtures are pure data.
 */
export async function assertDatabaseIsNotProduction(sql, ownedIds, { assumeYes }) {
  const fatal = []
  const suspicious = []

  const ownedOrders = ownedIds.orders ?? []
  const ownedVouchers = ownedIds.vouchers ?? []

  const settledPayments = await countIfPresent(sql, 'payments', (s) =>
    s`select count(*)::int as n from public.payments where cardcom_transaction_id is not null`,
  )
  if (settledPayments > 0) {
    fatal.push(`${settledPayments} payment row(s) carry a Cardcom transaction id`)
  }

  const foreignRedeemed = await countIfPresent(sql, 'vouchers', (s) =>
    s`select count(*)::int as n from public.vouchers
      where status = 'redeemed' and not (id = any(${ownedVouchers}::uuid[]))`,
  )
  if (foreignRedeemed > 0) {
    fatal.push(`${foreignRedeemed} redeemed voucher(s) this seed did not issue`)
  }

  const foreignOrders = await countIfPresent(sql, 'orders', (s) =>
    s`select count(*)::int as n from public.orders
      where not (id = any(${ownedOrders}::uuid[]))`,
  )
  if (foreignOrders > 0) {
    suspicious.push(`${foreignOrders} order(s) this seed did not create`)
  }

  if (fatal.length > 0) {
    throw new GuardError(
      'this database holds real commercial activity:\n' +
        fatal.map((f) => `  - ${f}`).join('\n') +
        '\nThe seed writes demo rows and will not run here, with or without flags.',
    )
  }

  if (suspicious.length > 0 && !assumeYes) {
    throw new GuardError(
      'this database already holds data the seed does not recognise:\n' +
        suspicious.map((f) => `  - ${f}`).join('\n') +
        '\nNothing here is provably real money, so pass --yes if this is a shared\n' +
        'development database and you accept seeding alongside that data.',
    )
  }

  return { fatal, suspicious }
}

async function countIfPresent(sql, table, query) {
  const [exists] = await sql`select to_regclass(${`public.${table}`}) is not null as present`
  if (!exists?.present) return 0
  const [row] = await query(sql)
  return row?.n ?? 0
}
