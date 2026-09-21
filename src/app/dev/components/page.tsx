import BrandPlaceholder from '@/components/ui/BrandPlaceholder'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SITE_CSS_METRICS, SITE_CSS_VARS } from '@/styles/tokens'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * The design-system primitives, rendered, on one page. This is the
 * repository's answer to "Storybook".
 *
 * WHY NOT STORYBOOK
 *
 * Storybook would add a second build (Vite), a second copy of the Tailwind
 * pipeline and a few hundred packages, to render eleven primitives that the
 * app already renders with the real tokens, the real fonts and the real RTL
 * direction. Every one of those things is exactly what a story would have to
 * fake. This page runs inside `pnpm dev`, so what it shows IS the app, and a
 * token change shows up here before it shows up anywhere else.
 *
 * DEV ONLY, WITH A 404, for the same reason as `/dev/emails`: in production
 * the route does not exist. `NODE_ENV` is `production` for a local `pnpm start`
 * too, so this is a `pnpm dev` tool and nothing else.
 */

export const metadata: Metadata = {
  title: 'רכיבי מערכת העיצוב',
  robots: { index: false, follow: false },
}

const BUTTON_VARIANTS = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const
const BUTTON_SIZES = ['sm', 'default', 'lg'] as const

/** Hex-valued site variables become swatches; the rest are listed as text. */
function isColour(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value)
}

export default function ComponentGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const colours = Object.entries(SITE_CSS_VARS).filter(([, v]) => isColour(v))
  const metrics = Object.entries(SITE_CSS_METRICS)

  return (
    <main dir="rtl" className="mx-auto max-w-4xl space-y-10 p-6">
      <header>
        <h1 className="text-2xl font-black text-heading">רכיבי מערכת העיצוב</h1>
        <p className="mt-2 text-sm text-muted">
          כל רכיב ב-`src/components/ui` על הטוקנים האמיתיים, בכיוון האמיתי, בפונט האמיתי. הדף קיים
          רק ב-`pnpm dev`.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-heading">כפתורים</h2>
        <div className="space-y-2">
          {BUTTON_SIZES.map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-2">
              <span className="w-16 text-xs text-muted">{size}</span>
              {BUTTON_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant}
                </Button>
              ))}
              <Button size={size} disabled>
                מושבת
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-heading">טפסים</h2>
        <div className="grid max-w-md gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="g-name">שם מלא</Label>
            <Input id="g-name" placeholder="דנה כהן" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-phone">טלפון</Label>
            <Input id="g-phone" inputMode="tel" dir="ltr" placeholder="050-000-0000" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-notes">הערות להזמנה</Label>
            <Textarea id="g-notes" placeholder="למשל: להשאיר אצל השכן" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-disabled">שדה מושבת</Label>
            <Input id="g-disabled" disabled value="לא ניתן לעריכה" readOnly />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-heading">כרטיס</h2>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>עיסוי שוודי זוגי</CardTitle>
            <CardDescription>ספא הרים, נהריה. מימוש עד 90 יום מהרכישה.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              הכותרת, התיאור, התוכן והשוליים הם ארבעת החלקים של הכרטיס. הכרטיס אינו יודע על כסף.
            </p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button>לרכישה</Button>
            <Button variant="outline">לפרטים</Button>
          </CardFooter>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-heading">דיאלוג</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">פתיחת דיאלוג</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>לבטל את ההזמנה?</DialogTitle>
              <DialogDescription>
                ההחזר ייכנס לאמצעי התשלום המקורי בתוך 14 ימי עסקים.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-start gap-2">
              <Button variant="destructive">ביטול ההזמנה</Button>
              <Button variant="ghost">חזרה</Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-heading">תמונת מותג חלופית</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="h-24 w-24 overflow-hidden rounded-lg border border-black/10">
            <BrandPlaceholder />
          </div>
          <div className="h-16 w-40 overflow-hidden rounded-lg border border-black/10">
            <BrandPlaceholder />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-heading">צבעי האתר ({colours.length})</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {colours.map(([name, value]) => (
            <li key={name} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="inline-block h-8 w-8 shrink-0 rounded border border-black/10"
                style={{ background: value }}
              />
              <span className="flex flex-col">
                <code dir="ltr">{name}</code>
                <code dir="ltr" className="text-muted">
                  {value}
                </code>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-heading">מידות ({metrics.length})</h2>
        <table className="w-full text-xs">
          <tbody>
            {metrics.map(([name, value]) => (
              <tr key={name} className="border-t border-black/5">
                <td className="py-1">
                  <code dir="ltr">{name}</code>
                </td>
                <td className="py-1 text-muted">
                  <code dir="ltr">{value}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
