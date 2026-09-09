import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type CategoryNode,
  MAX_CATEGORY_DEPTH,
  categoryAncestors,
  categoryDepth,
  categoryLineage,
  categorySubtree,
  isDescendantOf,
  parentChoiceError,
} from './category-tree'

function node(id: string, parent_id: string | null = null): CategoryNode {
  return { id, slug: id, name_he: `שם ${id}`, parent_id }
}

/** root > mid > leaf, with a second root that has no children. */
const TREE: CategoryNode[] = [node('root'), node('mid', 'root'), node('leaf', 'mid'), node('other')]

describe('categoryAncestors', () => {
  it('returns the ancestors root first, excluding the category itself', () => {
    expect(categoryAncestors(TREE, 'leaf').map((n) => n.id)).toEqual(['root', 'mid'])
  })

  it('returns nothing for a root', () => {
    expect(categoryAncestors(TREE, 'root')).toEqual([])
  })

  it('returns nothing for an id the index does not hold', () => {
    expect(categoryAncestors(TREE, 'ghost')).toEqual([])
  })

  it('walks two levels, which is what the one-hop version could not do', () => {
    // The regression this module exists for. `getCategoryParent` answered one
    // parent, so a grandchild's trail read `בית > mid > leaf` and silently
    // dropped `root` from both the visible breadcrumb and the BreadcrumbList.
    expect(categoryAncestors(TREE, 'leaf')).toHaveLength(2)
  })
})

describe('a parent_id that names a row the index does not hold', () => {
  it('truncates rather than claiming the grandparent is the parent', () => {
    // `mid` is missing here - an inactive row filtered out of the index, say.
    const gappy = [node('root'), node('leaf', 'mid'), node('other')]
    expect(categoryAncestors(gappy, 'leaf')).toEqual([])
  })
})

describe('cycles', () => {
  it('a self-parent terminates instead of looping', () => {
    const selfish = [{ ...node('a'), parent_id: 'a' }]
    expect(categoryAncestors(selfish, 'a')).toEqual([])
  })

  it('a two-row cycle terminates and reports only the true prefix', () => {
    // a -> b -> a. Walking up from `a` finds `b`, then `b`'s parent is `a`,
    // which is where the walk started. `b` is a real ancestor of `a` in the
    // data as written, so it is reported; the repeat is where it stops.
    const cycle = [node('a', 'b'), node('b', 'a')]
    expect(categoryAncestors(cycle, 'a').map((n) => n.id)).toEqual(['b'])
  })

  it('a three-row cycle terminates', () => {
    // a -> c -> b -> a. Walking up collects c then b, and b's parent is the
    // start. Reversed for display that reads `b > c > a`, which is the true
    // prefix of a trail that has no root to reach.
    const cycle = [node('a', 'c'), node('b', 'a'), node('c', 'b')]
    expect(categoryAncestors(cycle, 'a').map((n) => n.id)).toEqual(['b', 'c'])
  })

  it('categorySubtree terminates on a cycle', () => {
    const cycle = [node('a', 'b'), node('b', 'a')]
    expect(
      categorySubtree(cycle, 'a')
        .map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})

describe('categoryLineage', () => {
  it('is the ancestors plus the category, root first', () => {
    expect(categoryLineage(TREE, 'leaf').map((n) => n.id)).toEqual(['root', 'mid', 'leaf'])
  })

  it('is empty for an unknown id, not a one-element list of undefined', () => {
    expect(categoryLineage(TREE, 'ghost')).toEqual([])
  })
})

describe('categoryDepth', () => {
  it.each([
    ['root', 1],
    ['mid', 2],
    ['leaf', 3],
    ['ghost', 0],
  ])('%s sits at depth %i', (id, depth) => {
    expect(categoryDepth(TREE, id)).toBe(depth)
  })
})

describe('isDescendantOf', () => {
  it('sees a grandchild, not only a child', () => {
    expect(isDescendantOf(TREE, 'leaf', 'root')).toBe(true)
    expect(isDescendantOf(TREE, 'leaf', 'mid')).toBe(true)
  })

  it('is false upwards and sideways', () => {
    expect(isDescendantOf(TREE, 'root', 'leaf')).toBe(false)
    expect(isDescendantOf(TREE, 'other', 'root')).toBe(false)
  })

  it('is false for a category against itself', () => {
    expect(isDescendantOf(TREE, 'mid', 'mid')).toBe(false)
  })
})

describe('categorySubtree', () => {
  it('includes the row and everything under it', () => {
    expect(categorySubtree(TREE, 'root').map((n) => n.id)).toEqual(['root', 'mid', 'leaf'])
  })

  it('is just the row for a leaf', () => {
    expect(categorySubtree(TREE, 'leaf').map((n) => n.id)).toEqual(['leaf'])
  })
})

describe('parentChoiceError', () => {
  it('allows no parent at all', () => {
    expect(parentChoiceError(TREE, 'leaf', null)).toBeNull()
  })

  it('allows a legal move', () => {
    expect(parentChoiceError(TREE, 'other', 'root')).toBeNull()
  })

  it('refuses a parent that does not exist', () => {
    expect(parentChoiceError(TREE, 'other', 'ghost')).toContain('לא נמצאה')
  })

  it('refuses a row as its own parent', () => {
    // The dropdown filters this option out, and the filter is markup. A POST
    // that names the row's own id reached the database unchecked.
    expect(parentChoiceError(TREE, 'mid', 'mid')).toContain('אב של עצמה')
  })

  it('refuses a parent that is the row own child, which the dropdown offers', () => {
    // `mid` under `leaf`. Both ids differ, so `p.id !== category.id` lets it
    // through, and the pair then vanishes from the admin tree entirely.
    expect(parentChoiceError(TREE, 'mid', 'leaf')).toContain('שנמצאת כבר מתחתיה')
  })

  it('refuses a parent that is a deeper descendant', () => {
    const deep = [node('a'), node('b', 'a'), node('c', 'b')]
    expect(parentChoiceError(deep, 'a', 'c')).toContain('שנמצאת כבר מתחתיה')
  })

  it(`refuses a new category below depth ${MAX_CATEGORY_DEPTH}`, () => {
    expect(parentChoiceError(TREE, null, 'leaf')).toContain(String(MAX_CATEGORY_DEPTH))
  })

  it(`allows a new category at depth ${MAX_CATEGORY_DEPTH}`, () => {
    expect(parentChoiceError(TREE, null, 'mid')).toBeNull()
  })

  it('measures the whole moving subtree, not just the row being moved', () => {
    // `other` is a leaf, so `other` under `mid` lands at depth 3 and is legal.
    expect(parentChoiceError(TREE, 'other', 'mid')).toBeNull()

    // The same move, with a child hanging off `other`, would put that child at
    // depth 4. Re-parenting takes the subtree along; checking only the moved
    // row is how a four-level tree gets written one legal-looking step at a
    // time.
    const withChild = [...TREE, node('other-kid', 'other')]
    expect(parentChoiceError(withChild, 'other', 'mid')).toContain(String(MAX_CATEGORY_DEPTH))
  })
})

/**
 * ONE RULE, THREE SURFACES.
 *
 * The rule about what `parent_id` may hold was expressed three times, three
 * ways, and the three disagreed:
 *
 *   `CategoryForm` (the live form, mounted from /admin/categories/new,
 *   /admin/categories/[id] and the table) filtered `p.id !== category?.id` and
 *   nothing more: any depth, and a descendant was a valid choice.
 *
 *   `CategoryDialog` (the tree view) carried its own `getDepth` and
 *   `depth < MAX_DEPTH - 1`, which admits roots only -- two levels, under a
 *   label reading "מקס׳ 3 רמות". It filtered self, never descendants.
 *
 *   `upsertCategory`, the only one that a POST cannot go around, checked
 *   nothing at all beyond `z.string().uuid()`.
 *
 * This scan is what keeps them collapsed. It reads the files rather than
 * calling them because two are client components and the third is a server
 * action; what it is protecting is not behaviour on one input, it is that a
 * fourth surface cannot quietly grow a fourth copy of the rule.
 */
describe('the parent rule has one implementation', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

  const SURFACES = [
    'src/server/actions/admin/categories.ts',
    'src/components/admin/CategoryForm.tsx',
    'src/components/admin/CategoryDialog.tsx',
  ]

  it.each(SURFACES)('%s asks parentChoiceError', (path) => {
    expect(read(path)).toContain('parentChoiceError')
  })

  it.each(SURFACES)('%s does not roll its own depth walk', (path) => {
    // `getDepth` was CategoryDialog's private copy, and it was the one that was
    // off by one.
    expect(read(path)).not.toContain('function getDepth')
  })

  it('the server action is the surface that cannot be bypassed', () => {
    // A dropdown shapes the options; it does not inspect the POST. The two
    // client filters are there so an operator is not offered a choice that
    // bounces, and this is the one that holds when the request is not from them.
    const action = read('src/server/actions/admin/categories.ts')
    expect(action).toMatch(/parentChoiceError\([\s\S]{0,120}\)\n?\s*if \(problem\) return/)
  })

  it('the depth cap is named once and read everywhere', () => {
    // Two of the three render the number in a Hebrew label. A literal `3` in a
    // label beside a filter that allows two is exactly how the dialog came to
    // promise one thing and do another.
    for (const path of [
      'src/components/admin/CategoryForm.tsx',
      'src/components/admin/CategoryDialog.tsx',
    ]) {
      expect(read(path)).toContain('MAX_CATEGORY_DEPTH')
    }
  })
})
