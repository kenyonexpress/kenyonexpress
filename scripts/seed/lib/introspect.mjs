// scripts/seed/lib/introspect.mjs
//
// The seed asks the target database what it looks like before it writes.
//
// WHY THIS IS NOT OVER-ENGINEERING
//
// As measured on 2026-07-29 there are at least two live shapes of this schema
// and they disagree about money and about which tables exist at all:
//
//   * supabase/migrations/059_money_integer_units.sql adds products.price_agorot
//     and renames vouchers.platform_percent to platform_bp. The hosted project
//     has neither: it still has products.price_ils numeric and
//     vouchers.platform_percent numeric.
//   * The hosted project has no payouts, settlement_batches or ledger tables,
//     although migrations 051, 058 and 062 create them.
//
// A seed with a hard-coded column list therefore works against exactly one of
// its targets and fails with 42703 (undefined_column) against the other, which
// aborts the whole transaction rather than skipping a field. Probing costs two
// catalog queries at startup and makes one script correct on both.
//
// The probe is descriptive, never corrective: it reports what exists, and it
// never creates or alters anything. Missing tables are skipped with a line in
// the summary, so a run against a reduced schema says what it could not write
// instead of pretending it wrote everything.

export async function introspect(sql, schema = 'public') {
  const columnRows = await sql`
    select table_name, column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = ${schema}
    order by table_name, ordinal_position
  `

  const enumRows = await sql`
    select t.typname, e.enumlabel
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = ${schema}
    order by t.typname, e.enumsortorder
  `

  const tables = new Map()
  for (const row of columnRows) {
    if (!tables.has(row.table_name)) tables.set(row.table_name, new Map())
    tables.get(row.table_name).set(row.column_name, {
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === 'YES',
      hasDefault: row.column_default !== null,
      isEnum: row.data_type === 'USER-DEFINED',
    })
  }

  const enums = new Map()
  for (const row of enumRows) {
    if (!enums.has(row.typname)) enums.set(row.typname, new Set())
    enums.get(row.typname).add(row.enumlabel)
  }

  return new Schema(tables, enums)
}

export class Schema {
  constructor(tables, enums) {
    this.tables = tables
    this.enums = enums
  }

  hasTable(table) {
    return this.tables.has(table)
  }

  hasColumn(table, column) {
    return this.tables.get(table)?.has(column) ?? false
  }

  column(table, column) {
    return this.tables.get(table)?.get(column) ?? null
  }

  /** Column names of `table`, in ordinal order. Empty when the table is absent. */
  columnNames(table) {
    return [...(this.tables.get(table)?.keys() ?? [])]
  }

  /** The first of `candidates` that exists on `table`, or null. */
  firstColumn(table, candidates) {
    for (const candidate of candidates) {
      if (this.hasColumn(table, candidate)) return candidate
    }
    return null
  }

  enumHasValue(typeName, value) {
    return this.enums.get(typeName)?.has(value) ?? false
  }

  /**
   * Resolves one money field to the column that actually holds it on this
   * target, plus the unit that column expects.
   *
   * moneyField('products', 'price') is products.price_agorot (integer agorot)
   * where 059 has run and products.price_ils (numeric ILS) where it has not.
   * Callers hand lib/writer.mjs an agorot integer either way and the writer
   * converts; nothing above this line ever knows which shape it got.
   */
  moneyField(table, base) {
    const agorotColumn = `${base}_agorot`
    if (this.hasColumn(table, agorotColumn)) {
      return { column: agorotColumn, unit: 'agorot' }
    }
    const ilsColumn = `${base}_ils`
    if (this.hasColumn(table, ilsColumn)) {
      return { column: ilsColumn, unit: 'ils' }
    }
    // A few columns carry neither suffix (products.kenyon_price, products.full_price
    // and coupon_deals.original_price predate the convention).
    if (this.hasColumn(table, base)) {
      const type = this.column(table, base)
      return { column: base, unit: type.dataType === 'integer' ? 'agorot' : 'ils' }
    }
    return null
  }

  /**
   * Columns that an insert must supply: NOT NULL, no default, not generated.
   * The verify step uses this to prove a fixture is complete rather than
   * discovering it row by row through 23502 errors.
   */
  requiredColumns(table) {
    return [...(this.tables.get(table)?.values() ?? [])]
      .filter((column) => !column.nullable && !column.hasDefault)
      .map((column) => column.name)
  }

  summary() {
    return {
      tables: this.tables.size,
      enums: this.enums.size,
    }
  }
}
