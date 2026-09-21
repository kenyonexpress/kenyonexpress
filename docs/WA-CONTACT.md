# מערכת יצירת קשר בוואטסאפ (‏WA-CONTACT)

‏SECTIONS 94. נמדד ‏22.09.2026.

## למה המסמך הזה

עד היום היה לאתר **מספר אחד ומשפט אחד**, משוכפלים בשלושה קבצים ‏(`docs/WHATSAPP.md`
מ-02.09 מתאר את זה). הסעיף מבקש נושאים: מי שפונה בגלל תקלה, מי שרוצה להצטרף
כבית עסק ומי ששואל על הזמנה לא צריכים להתחיל את השיחה מאותה שורה, ולא בהכרח
באותו מספר.

| פריט בסעיף | היה | נוסף |
|-----------|-----|------|
| טבלת ‏`contact_channels` ‏(5 נושאים, מספר, פתיח עברי, סדר, פעיל) | — | ‏`migrations/pending/236_contact_channels.sql`; **אותן חמש שורות כברירת מחדל בקוד** ‏(`src/lib/contact/channels.ts`), והטסט מוודא שהזרע וברירת המחדל זהים |
| ‏CRUD באדמין | — | ‏`/admin/contact-channels`: טופס לכל נושא ולכל תבנית ‏route, ‏service role אחרי ‏`content: write`, ‏audit עם ‏before/after, מטמון ‏30 שניות שנמחק בשמירה |
| כפתור צף + ‏`/contact` + ‏footer: בחירת נושא → ‏wa.me | כפתור צף עם משפט קבוע; ‏`/contact` עם קישור אחד; ‏footer עם אייקון | הצף פותח גיליון נושאים ‏(עם נושא יחיד הוא נשאר קישור פשוט); ‏`/contact` מקבל בורר; ה-footer מקבל רשימת קישורים תחת "שירות" |
| ‏`suppliers.whatsapp_number` + כפתור "שאלה לבית העסק" במוצר ובספק | ‏`suppliers.whatsapp` קיים ‏(אותה עמודה, שם אחר), ולינק ספק ב-PDP רק כש-`products.whatsapp_enabled` | ‏`askBusinessHref`: המספר של הספק כשהמוצר מאפשר ויש מספר, **אחרת שירות לקוחות עם שם המוצר בפתיח**; הכפתור אומר לאן הוא מגיע ‏(`data-via`). בעמוד הספק ‏(`/s/[id]`) אין מוצר ולכן אין ‏opt-in: תמיד שירות לקוחות עם שם העסק |
| ‏`page_contact_config` לפי תבנית ‏route | — | בטבלה ובברירות מחדל: ‏`/product/[slug]`, ‏`/s/[id]`, ‏`/checkout`, ‏`/account`, ‏`/suppliers/apply`; ‏`resolvePageConfig` בוחר את התבנית הארוכה ביותר שמתאימה |
| אירועי ‏PostHog | ‏`whatsapp_click` מה-PDP בלבד | אותו שם אירוע עם ‏`channel` ו-`surface` ‏(‏`contact_page`, ‏`float`, ‏`ask_business`) ו-`product_id`/`supplier_id`. **לא שם חדש**: רשימת ההיתר של ‏`fn_ingest_analytics_events` בפרודקשן מכירה שמונה שמות וזורקת כל אחר ב-200 ‏(`registry-matches-migration.test.ts`) |
| ‏RLS | — | קריאה ציבורית של שורות פעילות בלבד ‏(anon + authenticated), אפס מדיניות כתיבה: כל כתיבה ‏service role מהאדמין |
| ‏E2E | — | ‏`e2e/wa-contact.spec.ts`: ארבעה טסטים, כל קישור נבדק כ-`wa.me/<digits>?text=` עם עברית מקודדת |

## החלטות

- **ברירות מחדל בקוד, טבלה כדריסה.** ‏236 ממתינה כמו כל מיגרציה כאן; חנות
  שמחכה למיגרציה כדי להציג כפתור וואטסאפ היא חנות בלי כפתור. ה-loader
  ‏(`src/server/contact/channels.ts`) נופל לברירות המחדל כשהטבלה חסרה או כשהקריאה
  נכשלת, ומדווח רק על כישלון שאינו "אין טבלה".
- **הצף לא יודע באיזה עמוד הוא.** הוא יושב ב-layouts, וה-proxy לא מעביר את
  הנתיב כ-header; לכן הגיליון הצף מציג את הנושאים בסדר המפעיל, וההתאמה לעמוד
  ‏(`page_contact_config`) חלה במקומות שיודעים מה העמוד: ‏PDP, עמוד ספק, ‏`/contact`.
- **ה-footer לא נמדד.** אותה החלטה כמו ב-`docs/WHATSAPP.md`: להדריט את ה-footer
  בכל עמוד כדי לספור הקשה היא עסקה גרועה. הבורר ב-`/contact`, הצף וכפתור
  "שאלה לבית העסק" סופרים.
- **‏`suppliers.whatsapp_number` לא נוסף.** העמודה ‏`suppliers.whatsapp` קיימת
  ונקראת ב-`loadProductBySlug`; עמודה שנייה באותה משמעות היא הפגם שהסעיף
  היה מייצר.
- **"תקלה באתר" פותח ב-"העמוד: "** בכוונה, כדי שהפונה יכתוב את הכתובת.

## קבצים

- ‏`migrations/pending/236_contact_channels.sql` ‏(+README, ‏APPLY-ORDER)
- ‏`src/lib/contact/channels.ts` ‏(+test), ‏`src/server/contact/channels.ts`
- ‏`src/components/contact/{ContactTopicPicker,WhatsAppFloatSheet,AskBusinessButton,FooterContactChannels}.tsx`, ‏`src/components/shared/WhatsAppFloat.tsx`
- ‏`src/app/(store)/contact/page.tsx`, ‏`src/components/layout/SiteFooter.tsx`, ‏`src/components/storefront/SupplierInfo.tsx`, ‏`src/app/(store)/product/[slug]/page.tsx`, ‏`src/app/(store)/s/[id]/page.tsx`
- ‏`src/app/(admin)/admin/contact-channels/{page,ContactChannelForms}.tsx`, ‏`src/server/actions/admin/contact-channels.ts`, ‏`src/lib/admin/nav.ts`, ‏`src/components/admin/AdminSidebar.tsx`, ‏`data/legacy/redirect-map.json`
- ‏`messages/{he,en}.json` ‏(`contact.*`), ‏`e2e/wa-contact.spec.ts`
