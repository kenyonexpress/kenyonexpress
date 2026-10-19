'use client'

import Image from 'next/image'
import Link from 'next/link'
import styles from './BrandsRow.module.css'

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
    <section className={styles.container}>
      <div className={styles.scrollWrapper}>
        <div className={styles.grid}>
          {brands.map((brand) => (
            <div key={brand.id} className={styles.item}>
              <Link
                href={`/search?supplier=${brand.id}`}
                className={styles.link}
                aria-label={`${brand.name_he} products`}
              >
                <div className={styles.imageWrapper}>
                  <Image
                    src={brand.logo_url}
                    alt={brand.name_he}
                    width={120}
                    height={80}
                    className={styles.image}
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
