import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: number | string
  icon: LucideIcon
  className?: string
  trend?: { value: number; label: string }
}

export default function StatsCard({ label, value, icon: Icon, className, trend }: Props) {
  return (
    <div className={cn('bg-white border border-gray-200 rounded-xl p-5', className)}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className="p-2 bg-brand-light rounded-lg">
          <Icon size={18} className="text-brand" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {trend && (
        <p className="mt-1 text-xs text-gray-400">
          {trend.value >= 0 ? '+' : ''}
          {trend.value}% {trend.label}
        </p>
      )}
    </div>
  )
}
