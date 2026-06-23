import { createClient } from '@/lib/supabase/server'

type Brand = {
  id: string
  business_name: string
  logo_url: string | null
}

/** refs/electro.html .brands-carousel — brand logos strip (sourced from active vendors) */
export default async function Brands() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vendors')
    .select('id, business_name, logo_url')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('business_name', { ascending: true })
    .limit(12)

  const brands = (data ?? []) as Brand[]

  if (brands.length === 0) return null

  return (
    <section
      dir="rtl"
      aria-label="מותגים מובילים"
      className="mx-auto max-w-page px-4 py-6 font-sans"
    >
      <header className="mb-4 border-b border-[#ededed] pb-3">
        <h2 className="text-[22px] font-bold text-[#333e48]">מותגים מובילים</h2>
      </header>

      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#ededed] bg-[#ededed] sm:grid-cols-3 lg:grid-cols-5">
        {brands.map((brand) => (
          <li key={brand.id} className="flex h-24 items-center justify-center bg-white px-4">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo_url}
                alt={brand.business_name}
                className="max-h-12 max-w-full object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-center text-sm font-semibold text-[#7e7e7e]">
                {brand.business_name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
