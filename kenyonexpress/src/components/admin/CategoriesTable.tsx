'use client'

import CategoryForm from '@/components/admin/CategoryForm'
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable'
import DeleteButton from '@/components/admin/DeleteButton'
import StatusBadge from '@/components/admin/StatusBadge'
import { softDeleteCategory } from '@/server/actions/admin/categories'
import type { Category } from '@/types/database'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export type CategoryRow = {
  id: string
  name_he: string
  slug: string
  parent_name: string | null
  sort_order: number
  is_active: boolean
}

interface Props {
  rows: CategoryRow[]
  categories: Category[]
  parentOptions: Pick<Category, 'id' | 'name_he'>[]
  editingCategory?: Category
  showNewForm?: boolean
}

export default function CategoriesTable({
  rows,
  categories,
  parentOptions,
  editingCategory,
  showNewForm,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(Boolean(showNewForm || editingCategory))
  const [activeCategory, setActiveCategory] = useState<Category | undefined>(editingCategory)

  function openEdit(id: string) {
    const cat = categories.find((c) => c.id === id)
    setActiveCategory(cat)
    setDialogOpen(true)
  }

  const columns: DataTableColumn<CategoryRow>[] = [
    {
      id: 'name',
      header: 'שם',
      sortable: true,
      accessor: (c) => c.name_he,
      cell: (c) => (
        <button
          type="button"
          onClick={() => openEdit(c.id)}
          className="font-medium text-[#000000] underline-offset-2 hover:underline"
        >
          {c.name_he}
        </button>
      ),
    },
    {
      id: 'slug',
      header: 'מזהה',
      sortable: true,
      accessor: (c) => c.slug,
      cell: (c) => <span className="font-mono text-xs text-black/40">{c.slug}</span>,
    },
    {
      id: 'parent',
      header: 'קטגוריית אב',
      sortable: true,
      accessor: (c) => c.parent_name ?? '',
      cell: (c) => <span className="text-black/70">{c.parent_name ?? '—'}</span>,
    },
    {
      id: 'sort',
      header: 'סדר',
      sortable: true,
      accessor: (c) => c.sort_order,
      cell: (c) => <span className="text-black/60">{c.sort_order}</span>,
    },
    {
      id: 'status',
      header: 'סטטוס',
      cell: (c) => (
        <StatusBadge
          label={c.is_active ? 'פעיל' : 'לא פעיל'}
          variant={c.is_active ? 'green' : 'gray'}
        />
      ),
    },
    {
      id: 'actions',
      header: 'פעולות',
      className: 'w-28',
      cell: (c) => <DeleteButton onConfirm={() => softDeleteCategory(c.id)} />,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#000000]">קטגוריות</h1>
        <button
          type="button"
          onClick={() => {
            setActiveCategory(undefined)
            setDialogOpen(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-[#000000] px-4 py-2 text-sm font-semibold text-[#FFFFFF] transition-colors hover:bg-[#B0E0E9] hover:text-[#000000]"
        >
          <Plus size={15} />
          קטגוריה חדשה
        </button>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(c) => c.id}
        searchKeys={[(c) => c.name_he, (c) => c.slug]}
        searchPlaceholder="חיפוש קטגוריות..."
        emptyMessage="אין קטגוריות"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto border-black/10 bg-[#FFFFFF]">
          <DialogHeader className="text-start">
            <DialogTitle className="text-[#000000]">
              {activeCategory ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              טופס יצירה או עריכה של קטגוריה
            </DialogDescription>
          </DialogHeader>
          <CategoryForm category={activeCategory} parentOptions={parentOptions} />
        </DialogContent>
      </Dialog>

      {(showNewForm || editingCategory) && (
        <p className="text-xs text-black/40">
          <Link href="/admin/categories" className="hover:underline">
            סגור טופס וחזור לטבלה
          </Link>
        </p>
      )}
    </div>
  )
}
