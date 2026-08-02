// Given the variant ids currently stored for a product (non-deleted) and the
// ids present in a submitted product form, return the ids that were removed in
// the UI and must be soft-deleted. Variants without an id are new insertions and
// are never part of this set.
//
// Before this existed, upsertProduct only inserted/updated variants, so a
// variant removed in the editor lived on in the DB and kept showing on the
// storefront, a data-integrity leak.
export function variantIdsToRemove(
  existingIds: Iterable<string>,
  submittedIds: Iterable<string | undefined>,
): string[] {
  const kept = new Set<string>()
  for (const id of submittedIds) {
    if (id) kept.add(id)
  }
  const removed: string[] = []
  for (const id of existingIds) {
    if (!kept.has(id)) removed.push(id)
  }
  return removed
}
