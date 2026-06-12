/**
 * Deals grid (jet-listing-grid faf8583) from refs/ke_live_singlefile.html.
 * First page: 6 slots; demo "קופון טסט" omitted per refs/content-map.md.
 */
import type { Product } from '@/components/ProductCard'

const WP_UPLOADS = 'https://kenyonexpress.co.il/wp-content/uploads'

export const KE_LIVE_DEALS: Product[] = [
  {
    id: 'ke-deal-9132',
    slug: 'עוזרת-אישית-שירותי-משרד',
    name_he: 'עוזרת אישית - שירותי משרד',
    kenyon_price: 949,
    full_price: 1500,
    images: [
      `${WP_UPLOADS}/2025/01/Outsourcing-Success_-Transforming-Property-Management-with-Virtual-Assistants-600x600.webp`,
    ],
    stock_quantity: 1,
    category: { name_he: 'בעלי מקצוע', slug: 'professionals' },
  },
  {
    id: 'ke-deal-9122',
    slug: 'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',
    name_he: 'תספורת לגבר, ילד, סידור זקן בפתח תקווה',
    kenyon_price: 20,
    full_price: 50,
    images: [
      `${WP_UPLOADS}/2025/01/Free-Photo-_-Client-doing-hair-cut-at-a-barber-shop-salon-600x417.webp`,
    ],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-8898',
    slug: 'צימר-שוויץ-בצפון',
    name_he: 'צימר שוויץ בצפון',
    kenyon_price: 3900,
    full_price: 5600,
    images: ['/images/products/WhatsApp-Image-2023-05-29-at-21.59.02-1-600x600.webp'],
    stock_quantity: 1,
    category: { name_he: 'צימרים מלונות ונופש', slug: 'vacation' },
  },
  {
    id: 'ke-deal-8893',
    slug: 'טיפול-פנים-copy',
    name_he: 'הסרת שיער בלייזר קר',
    kenyon_price: 250,
    full_price: 500,
    images: ['/images/products/WhatsApp-Image-2023-12-22-at-15.27.50-600x600.webp'],
    stock_quantity: 1,
    category: { name_he: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  },
  {
    id: 'ke-deal-8812',
    slug: 'מוצר-לדוגמא',
    name_he: 'תיק עור JEEP יוקרתי',
    kenyon_price: 99,
    full_price: 195,
    images: ['/images/products/S5cf8b9b35a5b49b0bf525d6cb7b89181H-600x600.webp'],
    stock_quantity: 1,
    category: { name_he: 'דילים חמים', slug: 'hot-deals' },
  },
]
