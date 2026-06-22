'use client'

import CategoryDialog from '@/components/admin/CategoryDialog'
import StatusBadge from '@/components/admin/StatusBadge'
import { softDeleteCategory, updateCategorySortOrder } from '@/server/actions/admin/categories'
import type { Category } from '@/types/database'
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface CatWithChildren extends Category {
  children: CatWithChildren[]
}

function buildTree(flat: Category[]): CatWithChildren[] {
  const map = new Map<string, CatWithChildren>()
  const roots: CatWithChildren[] = []

  for (const c of flat) map.set(c.id, { ...c, children: [] })

  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sort = (arr: CatWithChildren[]) => {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.name_he.localeCompare(b.name_he, 'he'))
    for (const n of arr) sort(n.children)
    return arr
  }

  return sort(roots)
}

interface NodeProps {
  node: CatWithChildren
  allFlat: Category[]
  depth: number
  onEdit: (c: Category) => void
  onAddChild: (parentId: string) => void
}

function CategoryNode({ node, allFlat, depth, onEdit, onAddChild }: NodeProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  async function handleDelete() {
    if (!confirm(`למחוק את "${node.name_he}"?`)) return
    const result = await softDeleteCategory(node.id)
    if (result.error) toast.error(result.error)
    else toast.success('קטגוריה נמחקה')
  }

  async function handleMove(direction: 'up' | 'down') {
    const siblings = allFlat
      .filter((c) => c.parent_id === node.parent_id && !c.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order)
    const idx = siblings.findIndex((c) => c.id === node.id)
    const target = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1]
    if (!target) return

    await Promise.all([
      updateCategorySortOrder(node.id, target.sort_order),
      updateCategorySortOrder(target.id, node.sort_order),
    ])
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors group border-b border-gray-100 ${depth > 0 ? 'bg-gray-50/30' : ''}`}
        style={{ paddingRight: `${1.25 + depth * 1.5}rem` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-700 w-4 shrink-0"
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="w-4 inline-block" />
          )}
        </button>

        {node.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={node.icon_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded bg-gray-200 shrink-0" />
        )}

        <span className="flex-1 text-sm font-medium text-gray-800 truncate">{node.name_he}</span>
        <span className="text-xs text-gray-400 font-mono hidden sm:inline">{node.slug}</span>

        <StatusBadge
          label={node.is_active ? 'פעיל' : 'לא פעיל'}
          variant={node.is_active ? 'green' : 'gray'}
        />

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => handleMove('up')}
            className="p-1 text-gray-400 hover:text-gray-700 text-xs"
            title="הזז למעלה"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => handleMove('down')}
            className="p-1 text-gray-400 hover:text-gray-700 text-xs"
            title="הזז למטה"
          >
            ↓
          </button>
          {depth < 2 && (
            <button
              type="button"
              onClick={() => onAddChild(node.id)}
              className="p-1 text-gray-400 hover:text-brand"
              title="הוסף תת-קטגוריה"
            >
              <Plus size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(node)}
            className="p-1 text-gray-400 hover:text-brand"
          >
            <Edit2 size={13} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="p-1 text-gray-400 hover:text-red-600"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <CategoryNode
            key={child.id}
            node={child}
            allFlat={allFlat}
            depth={depth + 1}
            onEdit={onEdit}
            onAddChild={onAddChild}
          />
        ))}
    </div>
  )
}

interface Props {
  categories: Category[]
}

export default function CategoryTree({ categories }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | undefined>()
  const [defaultParent, setDefaultParent] = useState<string | undefined>()

  const active = categories.filter((c) => !c.deleted_at)
  const tree = buildTree(active)
  const parentOptions = active.map((c) => ({
    id: c.id,
    name_he: c.name_he,
    parent_id: c.parent_id,
  }))

  function openCreate(parentId?: string) {
    setEditing(undefined)
    setDefaultParent(parentId)
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setDefaultParent(undefined)
    setDialogOpen(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">קטגוריות</h1>
        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex items-center gap-2 bg-brand hover:bg-[#fedd26] text-brand-dark text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
        >
          <Plus size={15} />
          קטגוריה חדשה
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {tree.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">אין קטגוריות עדיין</div>
        ) : (
          tree.map((node) => (
            <CategoryNode
              key={node.id}
              node={node}
              allFlat={active}
              depth={0}
              onEdit={openEdit}
              onAddChild={(parentId) => openCreate(parentId)}
            />
          ))
        )}
      </div>

      <CategoryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        category={editing}
        parentOptions={
          defaultParent ? parentOptions.map((p) => (p.id === defaultParent ? p : p)) : parentOptions
        }
      />
    </div>
  )
}
