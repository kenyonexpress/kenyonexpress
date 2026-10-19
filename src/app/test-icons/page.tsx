import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Heart,
  Info,
  Search,
  Settings,
  ShoppingCart,
  Star,
  X,
} from 'lucide-react'

import type { Metadata } from 'next'

import { Icon } from '@/components/ui/icon'

export const metadata: Metadata = {
  title: 'הדגמת מערכת הסמלים',
  robots: { index: false, follow: false },
}

export default function TestIconsPage() {
  const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const
  const variants = [
    'default',
    'primary',
    'secondary',
    'danger',
    'success',
    'warning',
    'info',
    'muted',
  ] as const
  const icons = [
    { name: 'Search', component: Search },
    { name: 'Check', component: Check },
    { name: 'Heart', component: Heart },
    { name: 'Settings', component: Settings },
    { name: 'ShoppingCart', component: ShoppingCart },
    { name: 'Star', component: Star },
    { name: 'X', component: X },
    { name: 'AlertCircle', component: AlertCircle },
    { name: 'Copy', component: Copy },
    { name: 'Download', component: Download },
    { name: 'Eye', component: Eye },
    { name: 'EyeOff', component: EyeOff },
    { name: 'Info', component: Info },
    { name: 'AlertTriangle', component: AlertTriangle },
  ]

  return (
    <main className="min-h-screen bg-white p-8 text-right" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">מערכת הסמלים</h1>
        <p className="text-gray-600 mb-12">
          הדגמת מערכת הסמלים - Lucide React עם גדלים וגרסאות עקביות
        </p>

        {/* Size Tokens Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">טוקנים גודל</h2>
          <div className="bg-gray-50 p-8 rounded-lg">
            <div className="grid grid-cols-5 gap-8">
              {sizes.map((size) => (
                <div key={size} className="flex flex-col items-center gap-4">
                  <div className="flex items-center justify-center h-32 w-full border border-dashed border-gray-300 rounded">
                    <Icon as={Search} size={size} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">{size.toUpperCase()}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {size === 'xs' && '16px'}
                      {size === 'sm' && '20px'}
                      {size === 'md' && '24px (default)'}
                      {size === 'lg' && '32px'}
                      {size === 'xl' && '48px'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Color Variants Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">גרסאות צבע</h2>
          <div className="space-y-6">
            {variants.map((variant) => (
              <div key={variant} className="bg-gray-50 p-6 rounded-lg">
                <h3 className="font-semibold mb-4 text-lg capitalize">{variant}</h3>
                <div className="flex items-center gap-6 flex-wrap">
                  {[
                    { name: 'Search', component: Search },
                    { name: 'Check', component: Check },
                    { name: 'Heart', component: Heart },
                    { name: 'AlertCircle', component: AlertCircle },
                    { name: 'Star', component: Star },
                  ].map(({ name, component }) => (
                    <div key={name} className="flex flex-col items-center gap-2">
                      <div className="flex items-center justify-center h-16 w-16 border border-gray-300 rounded">
                        <Icon as={component} variant={variant} size="md" />
                      </div>
                      <p className="text-xs text-gray-500 text-center">{name}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Size + Variant Combinations */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">שילובי גודל וגרסה</h2>
          <div className="grid grid-cols-1 gap-8">
            {variants.map((variant) => (
              <div key={variant} className="bg-gray-50 p-6 rounded-lg">
                <h3 className="font-semibold mb-4 capitalize text-lg">{variant} - All Sizes</h3>
                <div className="flex items-end gap-4 flex-wrap">
                  {sizes.map((size) => (
                    <div key={size} className="flex flex-col items-center gap-2">
                      <div className="flex items-center justify-center h-20 border border-gray-300 rounded px-4">
                        <Icon as={Check} size={size} variant={variant} />
                      </div>
                      <p className="text-xs text-gray-500">{size}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Icon Library */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">ספריית סמלים (Lucide React)</h2>
          <div className="grid grid-cols-7 gap-4">
            {icons.map(({ name, component }) => (
              <div key={name} className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded">
                <div className="flex items-center justify-center h-16 w-16">
                  <Icon as={component} size="md" variant="default" />
                </div>
                <p className="text-xs text-gray-600 text-center font-mono">{name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Usage Guidelines */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">הנחיות שימוש</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-lg mb-2">טוקנים גודל</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">xs</code>
                  {' - 16px for inline badges and small UI elements'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">sm</code>
                  {' - 20px for form inputs and navigation'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">md</code>
                  {' - 24px default size for most UI components'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">lg</code>
                  {' - 32px for emphasis and buttons'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">xl</code>
                  {' - 48px for hero sections and large displays'}
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">גרסאות צבע</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">default</code>
                  {' - Inherits text color (currentColor)'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">primary</code>
                  {' - Brand yellow for primary actions'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">secondary</code>
                  {' - Gray for secondary actions'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">danger</code>
                  {' - Red for destructive actions'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">success</code>
                  {' - Green for completed/successful states'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">warning</code>
                  {' - Orange for warning states'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">info</code>
                  {' - Blue for informational content'}
                </li>
                <li>
                  <code className="bg-white px-2 py-1 rounded text-sm">muted</code>
                  {' - Gray for disabled/muted states'}
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">דוגמת שימוש</h3>
              <pre className="bg-white p-4 rounded text-sm font-mono overflow-x-auto">
                {`import { Icon } from '@/components/ui/icon'
import { Search } from 'lucide-react'

export function SearchButton() {
  return (
    <button>
      <Icon as={Search} size="md" variant="primary" />
      Search
    </button>
  )
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* Accessibility Features */}
        <section>
          <h2 className="text-2xl font-bold mb-6">תכונות נגישות</h2>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-lg mb-2">נגישות מובנית</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li>
                  תמיכה ב-<code className="text-xs font-mono">aria-label</code> לקוראי מסך
                </li>
                <li>
                  תמיכה בתכונת <code className="text-xs font-mono">title</code> עבור רמזים
                </li>
                <li>
                  תמיכה בתכונות <code className="text-xs font-mono">role</code> מותאמות אישית
                </li>
                <li>העברת ref לגישה פרוגרמטית</li>
                <li>תמיכה ב-className מותאם אישית לעיצוב נוסף</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">דוגמה עם ARIA</h3>
              <pre className="bg-white p-4 rounded text-sm font-mono overflow-x-auto">
                {`<Icon
  as={Heart}
  size="lg"
  variant="danger"
  aria-label="הוסף למועדפים"
  title="הוסף למועדפים"
/>`}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
