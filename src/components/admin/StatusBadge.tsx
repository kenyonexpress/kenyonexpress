import { cn } from '@/lib/utils'

type Variant = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

const VARIANTS: Record<Variant, string> = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
  blue: 'bg-blue-100 text-blue-700',
}

interface Props {
  label: string
  variant: Variant
  className?: string
}

export default function StatusBadge({ label, variant, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        VARIANTS[variant],
        className,
      )}
    >
      {label}
    </span>
  )
}

// Mapping helpers used by multiple pages

export function productStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: Variant }> = {
    draft: { label: 'טיוטה', variant: 'gray' },
    active: { label: 'פעיל', variant: 'green' },
    paused: { label: 'מושהה', variant: 'yellow' },
    archived: { label: 'ארכיון', variant: 'gray' },
  }
  return map[status] ?? { label: status, variant: 'gray' as Variant }
}

export function vendorStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: Variant }> = {
    pending: { label: 'ממתין', variant: 'yellow' },
    active: { label: 'פעיל', variant: 'green' },
    suspended: { label: 'מושעה', variant: 'red' },
  }
  return map[status] ?? { label: status, variant: 'gray' as Variant }
}

export function orderStatusBadge(status: string) {
  const map: Record<string, { label: string; variant: Variant }> = {
    pending: { label: 'ממתין', variant: 'yellow' },
    paid: { label: 'שולם', variant: 'blue' },
    partially_fulfilled: { label: 'סופק חלקית', variant: 'blue' },
    fulfilled: { label: 'סופק', variant: 'green' },
    cancelled: { label: 'בוטל', variant: 'red' },
    refunded: { label: 'הוחזר', variant: 'gray' },
  }
  return map[status] ?? { label: status, variant: 'gray' as Variant }
}
