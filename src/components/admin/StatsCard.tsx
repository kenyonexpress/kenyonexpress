import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: number | string
  icon: LucideIcon
  className?: string
  trend?: { value: number; label: string }
  variant?: 'default' | 'admin'
}

export default function StatsCard({
  label,
  value,
  icon: Icon,
  className,
  trend,
  variant = 'default',
}: Props) {
  const isAdmin = variant === 'admin'

  return (
    <Card
      className={cn(
        'border shadow-sm',
        isAdmin ? 'border-gray-200 bg-white text-heading' : 'border-gray-200 bg-white',
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle
          className={cn('text-sm font-medium', isAdmin ? 'text-black/60' : 'text-gray-500')}
        >
          {label}
        </CardTitle>
        <div className={cn('rounded-lg p-2', isAdmin ? 'bg-brand-primary/30' : 'bg-brand-light')}>
          <Icon
            size={18}
            className={cn(isAdmin ? 'text-heading' : 'text-brand')}
            aria-hidden="true"
          />
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn('text-2xl font-bold', isAdmin ? 'text-heading' : 'text-gray-900')}>
          {value}
        </p>
        {trend && (
          <p className="mt-1 text-xs text-black/40">
            {trend.value >= 0 ? '+' : ''}
            {trend.value}% {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
