/**
 * Meta WhatsApp Business Verification Admin Page
 * BACKLOG Item 3: UI for collecting and submitting verification data
 */

import {
  type MetaVerificationData,
  formatForMetaApplication,
  generateVerificationChecklist,
} from '@/lib/admin/meta-verification-helper'
import { requireAdminPage } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'

export const metadata = {
  title: 'אימות Meta WhatsApp Business',
  description: 'טופס הגשה לאימות חשבון עסקי',
}

export default async function MetaVerificationPage() {
  await requireAdminPage()

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="mb-6 text-3xl font-bold">אימות Meta WhatsApp Business</h1>

      <div className="mb-8 rounded-lg bg-yellow-50 p-4">
        <h2 className="mb-2 text-lg font-semibold">דרישות מקדימות</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>חשבון Meta Business Manager פעיל</li>
          <li>10 הזמנות לפחות במערכת</li>
          <li>מסמכי רישום עסקי</li>
          <li>תעודת זהות של הבעלים</li>
        </ul>
      </div>

      <form action={submitVerification} className="space-y-6">
        <div>
          <label htmlFor="businessName" className="mb-1 block font-medium">
            שם עסק רשמי
          </label>
          <input
            type="text"
            id="businessName"
            name="businessName"
            required
            dir="rtl"
            className="w-full rounded-md border px-3 py-2"
            placeholder="קניון אקספרס בע״מ"
          />
        </div>

        <div>
          <label htmlFor="businessRegistrationNumber" className="mb-1 block font-medium">
            מספר עוסק מורשה / ח.פ.
          </label>
          <input
            type="text"
            id="businessRegistrationNumber"
            name="businessRegistrationNumber"
            required
            className="w-full rounded-md border px-3 py-2"
            placeholder="123456789"
          />
        </div>

        <div>
          <label htmlFor="businessCategory" className="mb-1 block font-medium">
            קטגוריית עסק
          </label>
          <select
            id="businessCategory"
            name="businessCategory"
            required
            className="w-full rounded-md border px-3 py-2"
          >
            <option value="">בחר קטגוריה</option>
            <option value="E-commerce">מסחר אלקטרוני</option>
            <option value="Retail">קמעונאות</option>
            <option value="Education">חינוך</option>
            <option value="Travel">תיירות</option>
            <option value="Other">אחר</option>
          </select>
        </div>

        <div>
          <label htmlFor="websiteUrl" className="mb-1 block font-medium">
            כתובת אתר
          </label>
          <input
            type="url"
            id="websiteUrl"
            name="websiteUrl"
            required
            dir="ltr"
            className="w-full rounded-md border px-3 py-2"
            placeholder="https://www.kenyonexpress.co.il"
          />
        </div>

        <div>
          <label htmlFor="businessEmail" className="mb-1 block font-medium">
            אימייל עסקי
          </label>
          <input
            type="email"
            id="businessEmail"
            name="businessEmail"
            required
            dir="ltr"
            className="w-full rounded-md border px-3 py-2"
            placeholder="info@kenyonexpress.co.il"
          />
        </div>

        <div>
          <label htmlFor="businessPhone" className="mb-1 block font-medium">
            טלפון עסקי
          </label>
          <input
            type="tel"
            id="businessPhone"
            name="businessPhone"
            required
            dir="ltr"
            className="w-full rounded-md border px-3 py-2"
            placeholder="+972-50-1234567"
          />
        </div>

        <div>
          <label htmlFor="ownerName" className="mb-1 block font-medium">
            שם הבעלים
          </label>
          <input
            type="text"
            id="ownerName"
            name="ownerName"
            required
            className="w-full rounded-md border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="businessAddress" className="mb-1 block font-medium">
            כתובת העסק
          </label>
          <textarea
            id="businessAddress"
            name="businessAddress"
            required
            rows={3}
            className="w-full rounded-md border px-3 py-2"
            placeholder="רחוב, עיר, מיקוד"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          הכן מסמך אימות
        </button>
      </form>

      <div className="mt-8 rounded-lg bg-gray-50 p-4">
        <h3 className="mb-2 font-semibold">שלבים נוספים</h3>
        <ol className="list-inside list-decimal space-y-1">
          <li>הורד את המסמך שנוצר</li>
          <li>העלה מסמכי רישום ותעודת זהות ל-Meta Business Manager</li>
          <li>הגש בקשה באתר Meta</li>
          <li>המתן לאישור (1-3 ימי עסקים)</li>
        </ol>
      </div>
    </div>
  )
}

async function submitVerification(formData: FormData) {
  'use server'

  const data: MetaVerificationData = {
    businessName: formData.get('businessName') as string,
    businessRegistrationNumber: formData.get('businessRegistrationNumber') as string,
    businessCategory: formData.get('businessCategory') as string,
    websiteUrl: formData.get('websiteUrl') as string,
    businessEmail: formData.get('businessEmail') as string,
    businessPhone: formData.get('businessPhone') as string,
    ownerName: formData.get('ownerName') as string,
    businessAddress: formData.get('businessAddress') as string,
  }

  const checklist = generateVerificationChecklist(data)

  if (!checklist.complete) {
    throw new Error(`חסרים שדות: ${checklist.missing.join(', ')}`)
  }

  const application = formatForMetaApplication(data)

  // Log application (in production, save to database or send notification)
  log.info('Meta verification application generated', { application })

  // Server actions return void - download handled client-side
}
