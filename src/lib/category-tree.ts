/**
 * The category tree, as walkable structure rather than as one hop.
 *
 * WHAT WAS THERE, MEASURED 2026-09-09. `categories` has carried a `parent_id`
 * since the WordPress import and the admin has always been able to nest: the
 * tree view has an "add child" button on every row, and the form has a
 * "קטגוריית אב" select listing every other active category. The storefront
 * walked exactly ONE hop. `/category/[slug]` fetched `getCategoryParent` and
 * built `בית > parent > current`; `/product/[slug]` built
 * `בית > category > product`. Neither could express a grandparent, in the
 * visible breadcrumb OR in the `BreadcrumbList` JSON-LD next to it.
 *
 * So the failure was not that the tree was wrong. It was that the tree was flat
 * -- production holds 12 categories, all twelve at depth 1, zero children -- and
 * a code path that only ever sees depth 2 cannot be observed to be wrong by
 * looking at a site whose data never reaches depth 3. The first nested category
 * an operator creates through the button that already exists publishes an
 * incomplete trail to Google, silently and with a green build.
 *
 * WHY THE WHOLE INDEX AND NOT A RECURSIVE QUERY. Walking up one row at a time
 * is one round trip per level, on a table of twelve rows that is already read
 * in full and cached by `getAllCategories`. `categoryIndex()` is one cached
 * read and every walk below is in-memory and synchronous, which is also what
 * makes them testable without a database.
 *
 * EVERY WALK IS CYCLE-SAFE, and that is not defensive dressing. Nothing in this
 * codebase stopped a cycle from being written: `upsertCategory` took any UUID
 * for `parent_id`, and the only guard was the `p.id !== category?.id` filter on
 * the `<option>` list, which is markup -- it excludes self from the dropdown and
 * has nothing to say about a POST, or about setting a category's parent to its
 * own child. See `parentChoiceError`, which is now that guard, server-side.
 */

export type CategoryNode = {
  id: string
  slug: string
  name_he: string
  parent_id: string | null
}

/**
 * How deep a tree the site is willing to publish: root, child, grandchild.
 *
 * Three because the section asks for three, and because each level past it
 * costs more than it returns here. A breadcrumb is rendered on one line in the
 * mobile rail and a fourth crumb wraps it; Google truncates displayed
 * breadcrumbs well before four; and with 44 active products a fourth level
 * partitions the catalogue into pages holding fewer products than one page of
 * the grid shows, which is a page that exists to be thin.
 *
 * Enforced on the WRITE (`parentChoiceError`), not on the read. A tree that is
 * already deeper than this -- imported, or written before this rule -- still
 * walks correctly and completely below, because refusing to render an ancestor
 * that exists would publish a trail that is wrong rather than one that is deep.
 */
export const MAX_CATEGORY_DEPTH = 3

/**
 * The runaway guard on every walk, independent of MAX_CATEGORY_DEPTH.
 *
 * Separate on purpose. `MAX_CATEGORY_DEPTH` is a product rule about what we
 * choose to publish and it can be raised; this is the number of iterations
 * after which a walk concludes the data is malformed and stops. Tying the two
 * together would mean that raising the product rule also raises the cost of the
 * pathological case.
 */
const WALK_LIMIT = 32

function byId(index: readonly CategoryNode[]): Map<string, CategoryNode> {
  const map = new Map<string, CategoryNode>()
  for (const node of index) map.set(node.id, node)
  return map
}

/**
 * The ancestors of `id`, ROOT FIRST, excluding the category itself.
 *
 * Root first because that is the order a breadcrumb reads and the order
 * `BreadcrumbList` numbers its positions. Returning it reversed and asking two
 * call sites to remember to flip it is the shape that lets one of them forget.
 *
 * An unknown id, a broken `parent_id` (a row that names a parent that is not in
 * the index -- an inactive one, say) and a cycle all yield the ancestors found
 * SO FAR rather than an exception. A breadcrumb is not worth a 500: the page
 * still has a heading, a grid and a home link, and the honest degraded answer
 * is a shorter trail.
 */
export function categoryAncestors(
  index: readonly CategoryNode[],
  id: string,
): readonly CategoryNode[] {
  const map = byId(index)
  const start = map.get(id)
  if (!start) return []

  const chain: CategoryNode[] = []
  const seen = new Set<string>([start.id])

  let current = start
  for (let step = 0; step < WALK_LIMIT; step += 1) {
    const parentId = current.parent_id
    if (!parentId) break

    // A cycle. Stop at the repeat rather than at the iteration cap, so the
    // trail we publish is the prefix that is actually true.
    if (seen.has(parentId)) break

    const parent = map.get(parentId)
    // Names a row the index does not hold. The chain is truncated here because
    // a gap in the middle of a breadcrumb is worse than a short one: it would
    // claim the grandparent is the parent.
    if (!parent) break

    seen.add(parent.id)
    chain.push(parent)
    current = parent
  }

  return chain.reverse()
}

/** `categoryAncestors` plus the category itself, root first. Empty if unknown. */
export function categoryLineage(
  index: readonly CategoryNode[],
  id: string,
): readonly CategoryNode[] {
  const self = index.find((node) => node.id === id)
  return self ? [...categoryAncestors(index, id), self] : []
}

/**
 * How many levels down `id` sits. A root is 1. An unknown id is 0.
 */
export function categoryDepth(index: readonly CategoryNode[], id: string): number {
  return categoryLineage(index, id).length
}

/** Whether `candidateId` sits anywhere beneath `ancestorId`. */
export function isDescendantOf(
  index: readonly CategoryNode[],
  candidateId: string,
  ancestorId: string,
): boolean {
  return categoryAncestors(index, candidateId).some((node) => node.id === ancestorId)
}

/**
 * The subtree rooted at `id`, including `id`. Root first, breadth first.
 *
 * Used by the write guard to answer "which rows may not become this row's
 * parent", and cycle-safe by construction: a node already emitted is never
 * queued again.
 */
export function categorySubtree(
  index: readonly CategoryNode[],
  id: string,
): readonly CategoryNode[] {
  const self = index.find((node) => node.id === id)
  if (!self) return []

  const out: CategoryNode[] = [self]
  const seen = new Set<string>([self.id])

  for (let i = 0; i < out.length && out.length < index.length; i += 1) {
    const parent = out[i]
    if (!parent) break
    for (const node of index) {
      if (node.parent_id === parent.id && !seen.has(node.id)) {
        seen.add(node.id)
        out.push(node)
      }
    }
  }

  return out
}

/**
 * Why this row may not have that parent, in Hebrew, or null when it may.
 *
 * THE ONE PLACE THE RULE LIVES, and it runs on the server. The four ways a
 * `parent_id` can be wrong, in the order they are cheap to check:
 *
 * 1. The parent does not exist. PostgREST would reject it on the foreign key
 *    with an English constraint message; this says it in the form's language.
 * 2. The parent IS the row. Postgres accepts a self-reference happily -- the
 *    FK is satisfied, the row points at itself -- and the result is a category
 *    that is its own ancestor.
 * 3. The parent is a DESCENDANT of the row. This is the one the dropdown's
 *    `id !== category.id` filter cannot see, because the offending option is a
 *    different row. Making a category the child of its own child detaches BOTH
 *    from every root, and `buildTree` in CategoryTree.tsx pushes a node with a
 *    known `parent_id` under that parent instead of into `roots` -- so the pair
 *    stops appearing in the admin tree at all. No error, no empty state, just
 *    two rows that are gone from the only screen that could put them back.
 * 4. The move would push the row, or something under it, past
 *    `MAX_CATEGORY_DEPTH`. Checked against the whole subtree and not just the
 *    row, because re-parenting a category takes its children with it: a leaf
 *    moved under a child is legal, and the same move applied to a row that has
 *    children of its own is what puts a grandchild at level four.
 */
export function parentChoiceError(
  index: readonly CategoryNode[],
  categoryId: string | null,
  parentId: string | null,
): string | null {
  if (!parentId) return null

  const parent = index.find((node) => node.id === parentId)
  if (!parent) return 'קטגוריית האב לא נמצאה'

  const parentDepth = categoryDepth(index, parent.id)

  // A new category: nothing hangs under it yet, so only its own level matters.
  if (!categoryId) {
    return parentDepth + 1 > MAX_CATEGORY_DEPTH
      ? `אי אפשר ליצור קטגוריה מתחת ל"${parent.name_he}": העץ מוגבל ל-${MAX_CATEGORY_DEPTH} רמות`
      : null
  }

  if (categoryId === parentId) return 'קטגוריה לא יכולה להיות אב של עצמה'

  if (isDescendantOf(index, parent.id, categoryId)) {
    return `אי אפשר להעביר קטגוריה מתחת ל"${parent.name_he}", שנמצאת כבר מתחתיה`
  }

  // The deepest row in the moving subtree, measured relative to the subtree's
  // own root, plus where that root is about to land.
  const movingRoot = categoryDepth(index, categoryId)
  const deepestBelow = categorySubtree(index, categoryId).reduce(
    (worst, node) => Math.max(worst, categoryDepth(index, node.id) - movingRoot),
    0,
  )
  if (parentDepth + 1 + deepestBelow > MAX_CATEGORY_DEPTH) {
    return `ההעברה תיצור עץ עמוק מ-${MAX_CATEGORY_DEPTH} רמות`
  }

  return null
}
