import { t } from '@/lib/i18n/messages'

const STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  withdrawn: 'bg-gray-100 text-gray-700',
}

function labelFor(status: string): string {
  switch (status) {
    case 'pending':
      return t('supplier.statusPending')
    case 'approved':
      return t('supplier.statusApproved')
    case 'rejected':
      return t('supplier.statusRejected')
    case 'withdrawn':
      return t('supplier.statusWithdrawn')
    default:
      return status
  }
}

export default function RequestStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STYLE[status] ?? STYLE.withdrawn}`}
    >
      {labelFor(status)}
    </span>
  )
}
