import type { Database } from '@/types/database'

export type HotCoupon = Database['public']['Tables']['products']['Row'] & {
  supplier?: {
    name: string | null
    logo_url: string | null
  } | null
}
