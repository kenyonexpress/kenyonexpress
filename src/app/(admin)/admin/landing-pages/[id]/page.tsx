import LandingPageForm from '@/components/admin/LandingPageForm'
import LandingStatusButtons from '@/components/admin/LandingStatusButtons'
import { requireSection } from '@/lib/admin/rbac'
import { landingExperiment } from '@/lib/landing/experiments'
import { readLandingPageById } from '@/lib/landing/read'
import { landingPath } from '@/lib/landing/slug'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת דף נחיתה' }

export default async function EditLandingPagePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('catalog', 'write')
  const { id } = await params
  const page = await readLandingPageById(id)
  if (!page) notFound()
  const experiment = landingExperiment(page)

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">{page.titleHe}</h1>
        <p className="mt-1 font-mono text-sm text-gray-600" dir="ltr">
          {landingPath(page.slug)}
        </p>
        {experiment && (
          <p className="mt-2 text-sm text-gray-600">
            ניסוי פעיל עם {experiment.variants.length} גרסאות.{' '}
            <Link href="/admin/experiments" className="text-blue-700 underline">
              לדוח ניסויי A/B
            </Link>
          </p>
        )}
      </header>

      {page.source === 'database' && <LandingStatusButtons id={page.id} status={page.status} />}

      <LandingPageForm initial={page} />
    </div>
  )
}
