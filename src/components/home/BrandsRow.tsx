'use client'

import Image from 'next/image'
import Link from 'next/link'

interface Brand {
  id: string
  name: string
  name_he: string
  logo_url: string
}

interface BrandsRowProps {
  brands: Brand[]
}

export default function BrandsRow({ brands }: BrandsRowProps) {
  if (!brands || brands.length === 0) {
    return null
  }

  return (
    <section className="home-brands">
      <div className="home-brands__scroll">
        <div className="home-brands__grid">
          {brands.map((brand) => (
            <div key={brand.id} className="home-brands__item">
              <Link
                href={`/search?supplier=${brand.id}`}
                className="home-brands__link"
                aria-label={`${brand.name_he} products`}
              >
                <div className="home-brands__image-wrap">
                  <Image
                    src={brand.logo_url}
                    alt={brand.name_he}
                    width={120}
                    height={80}
                    className="home-brands__image"
                    sizes="(max-width: 640px) 90px, (max-width: 1024px) 110px, 120px"
                    loading="lazy"
                  />
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
