import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'הדגמת שדות טופס',
  robots: 'noindex, nofollow',
}

export default function TestFormInputsPage() {
  return (
    <main className="w-full py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">שדות טופס - UX38</h1>

        {/* Input Component Variants */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">שדות טקסט</h2>

          <div className="space-y-6">
            {/* Default State */}
            <div>
              <h3 className="text-lg font-semibold mb-3">מצב ברירת מחדל</h3>
              <input
                id="default-input"
                type="text"
                placeholder="שדה טקסט"
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            {/* Error State */}
            <div>
              <h3 className="text-lg font-semibold mb-3">מצב שגיאה</h3>
              <input
                id="error-input"
                type="text"
                placeholder="שדה עם שגיאה"
                className="w-full flex h-10 rounded-md border border-[--electro-error] bg-[--electro-error-light] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-error] text-[--electro-text-primary]"
              />
            </div>

            {/* Success State */}
            <div>
              <h3 className="text-lg font-semibold mb-3">מצב הצלחה</h3>
              <input
                id="success-input"
                type="text"
                placeholder="שדה מוצלח"
                className="w-full flex h-10 rounded-md border border-[--electro-success] bg-[--electro-success-light] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-success] text-[--electro-text-primary]"
              />
            </div>

            {/* Disabled State */}
            <div>
              <h3 className="text-lg font-semibold mb-3">מצב מנוטרל</h3>
              <input
                id="disabled-input"
                type="text"
                placeholder="שדה מנוטרל"
                disabled
                className="w-full flex h-10 rounded-md border border-[--electro-border-alt] bg-[--electro-gray-light] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-[--electro-text-tertiary]"
              />
            </div>
          </div>
        </section>

        {/* Input Types */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">סוגי שדות</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="email-input" className="block text-sm font-medium mb-2">
                שדה דוא״ל
              </label>
              <input
                id="email-input"
                dir="ltr"
                type="email"
                placeholder="example@domain.com"
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            <div>
              <label htmlFor="phone-input" className="block text-sm font-medium mb-2">
                שדה טלפון
              </label>
              <input
                id="phone-input"
                dir="ltr"
                type="tel"
                placeholder="+972 50 123 4567"
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            <div>
              <label htmlFor="password-input" className="block text-sm font-medium mb-2">
                שדה סיסמה
              </label>
              <input
                id="password-input"
                type="password"
                placeholder="••••••••"
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>
          </div>
        </section>

        {/* Sizes */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">גדלים</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="input-sm" className="block text-sm font-medium mb-2">
                קטן (sm)
              </label>
              <input
                id="input-sm"
                type="text"
                placeholder="שדה קטן"
                className="w-full flex h-8 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-1 text-xs placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            <div>
              <label htmlFor="input-md" className="block text-sm font-medium mb-2">
                בינוני (md) - ברירת מחדל
              </label>
              <input
                id="input-md"
                type="text"
                placeholder="שדה בינוני"
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            <div>
              <label htmlFor="input-lg" className="block text-sm font-medium mb-2">
                גדול (lg)
              </label>
              <input
                id="input-lg"
                type="text"
                placeholder="שדה גדול"
                className="w-full flex h-12 rounded-md border border-[--electro-border] bg-[--electro-white] px-4 py-3 text-base placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>
          </div>
        </section>

        {/* Textarea */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">שדה טקסט רב-שורה</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="textarea-default" className="block text-sm font-medium mb-2">
                שדה ברירת מחדל
              </label>
              <textarea
                id="textarea-default"
                placeholder="כתוב הודעה..."
                className="w-full flex min-h-20 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info] resize-vertical font-medium"
              />
            </div>

            <div>
              <label htmlFor="textarea-error" className="block text-sm font-medium mb-2">
                שדה עם שגיאה
              </label>
              <textarea
                id="textarea-error"
                placeholder="הודעת שגיאה..."
                className="w-full flex min-h-20 rounded-md border border-[--electro-error] bg-[--electro-error-light] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-error] resize-vertical font-medium text-[--electro-text-primary]"
              />
            </div>
          </div>
        </section>

        {/* Hebrew RTL Support */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">תמיכה עברית RTL</h2>

          <div className="space-y-4" dir="rtl">
            <div>
              <label htmlFor="he-text" className="block text-sm font-medium mb-2">
                טקסט רגיל
              </label>
              <input
                id="he-text"
                type="text"
                placeholder="הקלד טקסט בעברית..."
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            <div>
              <label htmlFor="he-email" className="block text-sm font-medium mb-2">
                דוא״ל
              </label>
              <input
                id="he-email"
                dir="ltr"
                type="email"
                placeholder="example@domain.com"
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            <div>
              <label htmlFor="he-phone" className="block text-sm font-medium mb-2">
                טלפון
              </label>
              <input
                id="he-phone"
                dir="ltr"
                type="tel"
                placeholder="+972 50 123 4567"
                className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
              />
            </div>

            <div>
              <label htmlFor="he-message" className="block text-sm font-medium mb-2">
                הודעה
              </label>
              <textarea
                id="he-message"
                placeholder="כתוב הודעה בעברית..."
                className="w-full flex min-h-20 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info] resize-vertical font-medium"
              />
            </div>

            <div>
              <label htmlFor="he-error" className="block text-sm font-medium mb-2">
                שגיאה
              </label>
              <input
                id="he-error"
                type="text"
                placeholder="שדה עם שגיאה"
                className="w-full flex h-10 rounded-md border border-[--electro-error] bg-[--electro-error-light] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-error] text-[--electro-text-primary]"
              />
            </div>
          </div>
        </section>

        {/* Focus States Demo */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">מצבי התמקדות</h2>
          <p className="text-sm text-[--electro-text-secondary] mb-4">
            לחץ על השדות כדי לראות את השפעת הטבעת. צבע הטבעת משתנה בהתאם לגרסה (ברירת מחדל: כחול,
            שגיאה: אדום, הצלחה: ירוק).
          </p>

          <div className="space-y-4">
            <input
              id="focus-default"
              type="text"
              placeholder="לחץ כאן לראות טבעת התמקדות (כחול)"
              className="w-full flex h-10 rounded-md border border-[--electro-border] bg-[--electro-white] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-info]"
            />

            <input
              id="focus-error"
              type="text"
              placeholder="לחץ כאן לראות טבעת התמקדות (אדום)"
              className="w-full flex h-10 rounded-md border border-[--electro-error] bg-[--electro-error-light] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-error] text-[--electro-text-primary]"
            />

            <input
              id="focus-success"
              type="text"
              placeholder="לחץ כאן לראות טבעת התמקדות (ירוק)"
              className="w-full flex h-10 rounded-md border border-[--electro-success] bg-[--electro-success-light] px-3 py-2 text-sm placeholder:text-[--electro-text-tertiary] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--electro-success] text-[--electro-text-primary]"
            />
          </div>
        </section>

        {/* Feature Summary */}
        <section className="bg-[--electro-surface] rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4">תכונות UX38</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>סוגי שדות נתמכים: טקסט, דוא״ל, טלפון, סיסמה</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>שדה טקסט רב-שורה עם שינוי גודל</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>תפריט בחירה עם מצבי שגיאה והצלחה</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>מצבי התמקדות באמצעות focus-visible</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>גרסת שגיאה עם border אדום ורקע</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>גרסת הצלחה עם border ירוק ורקע</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>מצב מנוטרל עם שינוי אטימות וסמן</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>שלוש גדלים: sm (8px), md (10px), lg (12px)</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>תמיכה עברית RTL עם כיווניות טקסט נכונה</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>מעברי צבע חלקים בכל מצבי</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>צבעים מבוססי משתנים לעקביות</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-3">✓</span>
              <span>נגישות: אינדיקטורי התמקדות נכונים למשתמשי מקלדת</span>
            </li>
          </ul>
        </section>
      </div>
    </main>
  )
}
