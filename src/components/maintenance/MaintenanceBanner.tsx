import { type FlagEnv, isFlagOn } from '@/lib/flags'

/**
 * Soft "maintenance ahead" notice, shown only while FLAG_MAINTENANCE_BANNER is
 * on. Separate from MAINTENANCE_MODE, which blocks traffic; this only informs.
 */
export default function MaintenanceBanner({ env = process.env }: { env?: FlagEnv }) {
  if (!isFlagOn('maintenance-banner', env)) return null
  return (
    <output
      dir="rtl"
      data-maintenance-banner
      className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950"
    >
      האתר בתחזוקה קצרה. ייתכנו עיכובים קלים בשירות.
    </output>
  )
}
