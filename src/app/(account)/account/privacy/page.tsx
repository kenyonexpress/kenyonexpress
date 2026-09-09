import DeleteAccountForm from '@/components/account/DeleteAccountForm'
import Link from 'next/link'

export const metadata = { title: 'פרטיות ונתונים' }

/**
 * The two GDPR self-service rights in one place: the access right as a JSON
 * download and the erasure right as the deletion form, next to the documents
 * that promise them. The export link is a plain <a> on purpose: the endpoint
 * answers with Content-Disposition attachment off the session cookie, and a
 * navigation (not fetch) lets the browser stream it straight to a file.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1 className="account-title">פרטיות ונתונים</h1>
      <p className="account-subtitle">המידע שנשמר עליכם, ומה אפשר לעשות איתו</p>

      <section className="account-card">
        <h2 className="account-card__title">הורדת המידע שלכם</h2>
        <p className="account-row__meta">
          קובץ JSON אחד עם כל המידע שנשמר על החשבון: פרטים אישיים, כתובות, הזמנות, שוברים, יתרת ארנק
          ותנועות, אמצעי תשלום (ספרות אחרונות בלבד) והפניות של חבר מביא חבר.
        </p>
        <p className="account-row__meta">שמרו את הקובץ במקום פרטי: הוא מכיל מידע אישי.</p>
        <a
          href="/api/account/export"
          className="mt-3 inline-block min-h-11 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90"
        >
          הורדת קובץ הנתונים
        </a>
      </section>

      <section className="account-card">
        <h2 className="account-card__title">המסמכים המלאים</h2>
        <p className="account-row__meta">
          מה נאסף, למה, כמה זמן נשמר ומהן הזכויות שלכם, מפורט ב
          <Link href="/privacy-policy" className="underline">
            מדיניות הפרטיות
          </Link>{' '}
          וב
          <Link href="/terms-and-conditions" className="underline">
            תקנון האתר
          </Link>
          .
        </p>
      </section>

      <section className="account-card">
        <h2 className="account-card__title">מחיקת החשבון</h2>
        <p className="account-row__meta">
          מחיקת החשבון היא לצמיתות: פרטים אישיים, כתובות, אמצעי תשלום, רשימות משאלות והתראות נמחקים
          או הופכים לאנונימיים, וכל המכשירים מנותקים מיד. מנויים פעילים מבוטלים.
        </p>
        <p className="account-row__meta">
          רשומות הנהלת חשבונות (הזמנות, חשבוניות, תנועות ארנק) נשמרות ללא פרטים מזהים, כפי שמחייב
          החוק. שוברים שטרם מומשו לא יהיו נגישים אחרי המחיקה, לכן כדאי לממש אותם קודם.
        </p>
        <DeleteAccountForm />
      </section>
    </>
  )
}
