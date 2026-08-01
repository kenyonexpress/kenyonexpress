// scripts/seed/lib/writer.mjs
//
// The write boundary. Three jobs, all of them about not trusting the fixture
// files to know the target's shape:
//
//   1. Unit conversion. Fixtures carry integer agorot for every amount.
//      putMoney() looks up which column this target actually has and writes
//      agorot to *_agorot or an exact 2-decimal string to *_ils. No fixture
//      ever calls toIls() itself, so there is one place where the conversion
//      can be wrong and one place to check it.
//   2. Column filtering. A fixture may name a column the target does not have
//      (products.brand exists on the hosted project; an older rebuild has no
//      such column). Rather than fail the transaction with 42703 the writer
//      drops the key and records it, and the run summary prints what was
//      dropped. Silence would be worse than either alternative: it would look
//      like the field was written.
//   3. SQL construction. Statements are built as text with numbered
//      placeholders and run through sql.unsafe(text, params). Identifiers are
//      not interpolated from fixture keys: every one is first proven to exist
//      in information_schema and then re-checked against IDENTIFIER_PATTERN,
//      so a fixture key can never become SQL.
//
// Everything goes through upsert() on the primary key `id`, whose value comes
// from lib/ids.mjs. Re-running the seed therefore rewrites its own rows and
// never appends a second catalog.

import { toIls } from './money.mjs'

/** Postgres refuses more than 65535 bind parameters in one statement. */
const MAX_PARAMETERS = 20_000

/** Postgres identifiers as this schema uses them. Anything else is a bug. */
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/

function quoteIdentifier(name) {
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new Error(`refusing to build SQL with the identifier "${name}"`)
  }
  return `"${name}"`
}

export class Writer {
  constructor(sql, schema, { dryRun = false, log = () => {} } = {}) {
    this.sql = sql
    this.schema = schema
    this.dryRun = dryRun
    this.log = log
    /** table -> Set of column names a fixture asked for and this target lacks. */
    this.dropped = new Map()
    /** table -> rows written (or, under --dry-run, rows that would be). */
    this.counts = new Map()
  }

  /**
   * Sets one money field on `row`, in whichever unit this target's column
   * wants. Records a drop when the target has neither spelling of the column,
   * which is how a fixture written for the full schema stays runnable against
   * a reduced one.
   */
  putMoney(row, table, base, agorotValue) {
    if (agorotValue === null || agorotValue === undefined) return row
    const field = this.schema.moneyField(table, base)
    if (!field) {
      this.noteDropped(table, `${base}_agorot|${base}_ils`)
      return row
    }
    row[field.column] = field.unit === 'agorot' ? agorotValue : toIls(agorotValue)
    return row
  }

  /**
   * Sets a field only if the column exists. For the fields that are genuinely
   * optional across schema variants (products.brand, orders.expires_at).
   */
  putIfPresent(row, table, column, value) {
    if (this.schema.hasColumn(table, column)) row[column] = value
    else this.noteDropped(table, column)
    return row
  }

  /**
   * An enum literal the target actually has, or `fallback`. product_status
   * gained 'sold_out' in migration 084; a target without it must not receive
   * that string, because Postgres rejects the whole statement rather than the
   * one value.
   */
  enumValue(typeName, preferred, fallback) {
    return this.schema.enumHasValue(typeName, preferred) ? preferred : fallback
  }

  noteDropped(table, column) {
    if (!this.dropped.has(table)) this.dropped.set(table, new Set())
    this.dropped.get(table).add(column)
  }

  /** Drops keys this target has no column for. Returns the filtered copy. */
  filterRow(table, row) {
    const filtered = {}
    for (const [key, value] of Object.entries(row)) {
      if (value === undefined) continue
      if (this.schema.hasColumn(table, key)) filtered[key] = value
      else this.noteDropped(table, key)
    }
    return filtered
  }

  /**
   * jsonb parameters must arrive as text. Everything else Postgres infers from
   * the INSERT target column, so no value carries an explicit cast.
   */
  encodeValue(table, column, value) {
    if (value === null || value === undefined) return null
    if (this.schema.column(table, column)?.udtName === 'jsonb') {
      return typeof value === 'string' ? value : JSON.stringify(value)
    }
    return value
  }

  /**
   * Upserts rows on `conflict`. The column list is the union of keys across
   * all rows, and every row is normalised to it, because one statement has one
   * column list and a row missing a key would otherwise shift its values.
   *
   * `conflict` is often a natural key rather than the primary key. categories
   * and products carry UNIQUE(slug), and a target that already holds the live
   * catalog has those slugs under ids the seed did not choose; upserting on
   * `id` would then fail on the slug constraint instead of updating the row.
   * So `id` is written on insert and never in the update set: an existing row
   * keeps the identity every foreign key already points at.
   *
   * `returning` asks for columns back, which is how a step learns the id a row
   * ended up with when that id was not the one it proposed.
   */
  async upsert(table, rows, { conflict = 'id', returning = null } = {}) {
    if (!this.schema.hasTable(table)) {
      this.log(`  skip ${table}: not present on this target`)
      return returning ? [] : 0
    }
    if (rows.length === 0) return returning ? [] : 0

    const filtered = rows.map((row) => this.filterRow(table, row))
    const columns = [...new Set(filtered.flatMap((row) => Object.keys(row)))]
    if (columns.length === 0) {
      this.log(`  skip ${table}: no fixture column exists on this target`)
      return returning ? [] : 0
    }
    if (!columns.includes(conflict)) {
      throw new Error(`upsert into ${table} needs the conflict column "${conflict}" in every row`)
    }

    const quotedTable = quoteIdentifier(table)
    const quotedColumns = columns.map(quoteIdentifier)
    const updatable = columns.filter((column) => column !== conflict && column !== 'id')
    const setClause = updatable
      .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
      .join(', ')
    const returningClause = returning
      ? ` returning ${returning.map(quoteIdentifier).join(', ')}`
      : ''
    const chunkSize = Math.max(1, Math.floor(MAX_PARAMETERS / columns.length))

    let written = 0
    const returned = []
    for (let offset = 0; offset < filtered.length; offset += chunkSize) {
      const chunk = filtered.slice(offset, offset + chunkSize)
      if (this.dryRun) {
        written += chunk.length
        for (const row of chunk) {
          returned.push(Object.fromEntries((returning ?? []).map((c) => [c, row[c] ?? null])))
        }
        continue
      }

      const params = []
      const tuples = chunk.map((row) => {
        const placeholders = columns.map((column) => {
          params.push(this.encodeValue(table, column, row[column] ?? null))
          return `$${params.length}`
        })
        return `(${placeholders.join(', ')})`
      })

      const text =
        `insert into ${quotedTable} (${quotedColumns.join(', ')}) values ${tuples.join(', ')} ` +
        `on conflict (${quoteIdentifier(conflict)}) do ` +
        (setClause ? `update set ${setClause}` : 'nothing') +
        returningClause

      const result = await this.sql.unsafe(text, params)
      if (returning) returned.push(...result)
      written += chunk.length
    }

    this.counts.set(table, (this.counts.get(table) ?? 0) + written)
    return returning ? returned : written
  }

  /**
   * Deletes previously seeded rows from `table` by id. Only ids this run
   * computed are passed, which is gate 3 from lib/guard.mjs: a seed pointed at
   * the wrong database still cannot delete a row it did not write.
   */
  async deleteOwned(table, ids) {
    if (!this.schema.hasTable(table) || ids.length === 0) return 0
    if (this.dryRun) return ids.length
    const result = await this.sql.unsafe(
      `delete from ${quoteIdentifier(table)} where id = any($1::uuid[])`,
      [ids],
    )
    return result.count ?? 0
  }

  droppedSummary() {
    return [...this.dropped.entries()]
      .map(([table, columns]) => `${table}: ${[...columns].sort().join(', ')}`)
      .sort()
  }
}
