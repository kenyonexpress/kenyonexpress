# KenyonExpress State

## Current Phase
**Phase 5 — Homepage 1:1 (סגור)**. branch `phase5/homepage`. מקור יחיד: `refs/ke_live_singlefile.html`.

## Last Completed
Session 2026-07-09 - תכנון אסטרטגיית בדיקות, איכות ו-CI/CD (design only, אין קוד ואין מיגרציות):
- **`docs/TESTING-CICD-ARCHITECTURE.md`**: 12 הכרעות (D1-D12). המרכזיות: סביבת אינטגרציה = Supabase מקומי (Docker) שנבנה מאפס בכל ריצת CI (לא Supabase branch, לא פרויקט dev המשותף; ה-drift הופך את dev לבלתי-אמין, ו-stack נקי מוודא בכל PR את bootstrap הפרודקשן העתידי); כל אריתמטיקת כסף במודול טהור יחיד `src/lib/money/` (אגורות integer) שנולד עם 22 מקרי בדיקה (M1-M22: אחוזי קצה 0/0.01/12.5/33.33/99.99/100, round-half-up מול banker's, עיגול פעם אחת לשורה ולא ליחידה, הקצאת ארנק O5); Cardcom אמיתי לא משתתף ב-PR CI (adapter יחיד + fake; sandbox אמיתי רק לילי/ידני); E2E בלי Google OAuth אמיתי (משתמשי בדיקה מקומיים); מטריצת RLS הצהרתית (9 personas על ~28 טבלאות, כולל בדיקה שלילית על ה-runner עצמו); harness מיגרציות = apply מלא פעמיים על stack נקי + אימות pg_policies יציב; 10 מקרי replay/התקפה ל-webhook (W1-W10) + 8 מקרי refund (R1-R8); visual regression ב-Playwright snapshots על 390/360/768/1440 (compare.mjs נשאר כלי 1:1 ידני); צינור ci.yml עם 9 jobs, חוסם merge: static/unit/build/integration/migrations(path-filter)/e2e-smoke, מזהיר: e2e-full/visual/Lighthouse; רשימת 14 אינברינטים סגורה (סעיף 2.0) שכל אחד חייב בדיקה; DoD לכל שלב (עגלה, checkout, ארנק, ספקים).
- **חוב בדיקות T1-T12**, החמורים: T1 אין CI בכלל; T2 rate-limit.ts fails open (מתועד); T3 mergeGuestCart race (מתועד); T4 policy שבורה 014; T5 payment_tokens עדיין תחת policy ישנה של 001 (אסור token אמיתי עד 029).
- **לא כלול**: קבצי workflow, קוד בדיקות, seed.sql, fake של Cardcom - נכתבים כשמתחילים Phase 2/3 לפי המסמך.

Session 2026-07-09 - תכנון מיגרציית דאטה מוורדפרס/WooCommerce (design only, לא הוחל):
- **`docs/WP-DATA-MIGRATION-ARCHITECTURE.md`**: ארכיטקטורת ייבוא מלאה מהאתר החי kenyonexpress.co.il. הכרעות מרכזיות: מקור חילוץ = mysqldump מלא + העתק wp-content/uploads (נדחו REST/WXR); סכימת `wp_import` = ארכיון קבוע + staging בפרויקט היעד, לא חשופה ל-PostgREST; **הזמנות היסטוריות = ארכיון בלבד, לא מיובאות ל-public.orders** (סמנטיקת snapshot כספי של 026 לא ניתנת לשחזור, ledger כפול, הזמנות אורח מול NOT NULL user_id), חריג יחיד: שוברים חיים לא-ממומשים מקבלים שרשרת מינימלית orders+order_items+coupon_codes כדי שמימוש/QR יעבדו; לקוחות דרך Auth Admin API (הטריגרים handle_new_user/prefs רצים), בלי סיסמאות (phpass לא נתמך + מדיניות Google/OTP), dedupe לפי אימייל; **כל המיובאים marketing_*=false** (חוק הספאם 30א, אין ייבוא consent בלי ראיות והכרעה); מוצרי Woo נכנסים ל-products בלבד (coupon_deals נשארת admin-curated); slugs חדשים לטיניים + 301 לכל URL ישן דרך seo_redirects (source='wordpress_import', יעד /products/ ברבים); תמונות: מקור -> WebP 1600px + נגזרת OG -> bucket product-images תחת wp/<id>/, דה-דופ sha256, מפת שכתוב ב-wp_import.media; ביצוע one-shot חזרתי idempotent (id_map + batches), הקפאת קטלוג 48h, dump סופי T-24h, DNS flip לפי PRODUCTION-OPS, dump הזמנות משלים T+7; rollback = DNS חזרה + purge לפי batch; שערי אימות: ספירות+checksums, spot-check 20+10+5, 100% כיסוי url_inventory. מיפוי שדה-שדה מלא (products/variants/categories/customers/orders) + כללי ניקוי (HTML, מחירים, טלפונים 05X-XXXXXXX, כתובות) + תכנון סקריפטים scripts/wp-import/00-09.
- **`supabase/migrations/032_wp_import_staging.sql`** (טיוטה, idempotent, **לא הוחלה, staging בלבד**): סכימת wp_import עם 12 טבלאות (import_batches, id_map עם snapshot projected, products כולל וריאציות ועמודות curation, categories עם manual_target_slug, customers עם ראיות opt-in גולמיות, orders+order_items ארכיון עם תמיכת HPOS, coupons, vouchers, media עם צנרת סטטוסים, url_inventory עם שער 301, issues עם unique פתוח) + 2 views (v_reconciliation, v_open_issues) + RLS admin-read-only + grants ל-service_role בלבד. עצמאית לחלוטין, בלי תלות ב-026-031, לא נוגעת ב-public.
- **שאלות פתוחות מרכזיות**: זהות plugin השוברים באתר הישן ומיקום הטבלה שלו; כמות שוברים פתוחים ב-cutover (קובע אם החריג של 1.4 בכלל נדרש); גישה בפועל לאחסון/DB הישן + GSC; האם שולחים מייל מעבר תפעולי; יתרות store credit ישנות; עמודי תוכן לכתיבה מחדש.

Session 2026-07-08 - תכנון דומיין התראות, הודעות ואוטומציית שיווק (design only, לא הוחל):
- **`docs/NOTIFICATIONS-MARKETING-ARCHITECTURE.md`**: הפרדה קשיחה טרנזקציוני/שיווקי (חוק הספאם 30א: opt-in בלבד, בלי חריג לקוח קיים, "פרסומת" בכותרת, הסרה בלי login שנאכפת גם ב-send-time), בחירת ספקים לישראל: וואטסאפ Meta Cloud API ישיר כערוץ ראשי, מייל Resend עם הפרדת סאב-דומיין txn/mkt, SMS אגרגטור ישראלי לטרנזקציוני בלבד + מודל עלויות (פחות מ-10 אגורות להזמנה), צנרת דו-שלבית: triggers -> notification_events (עובדות) -> fanout (מדיניות) -> notifications_outbox של 029 -> worker עם claim אטומי (SKIP LOCKED) -> ספקים -> delivery events, retry מעריכי + dead-letter אחרי 5 ניסיונות + סטטוס skipped נפרד, תבניות versioned (אחת active פר key/channel/locale, חתימת גרסה על כל שליחה) עם כללי RTL מחייבים, consent_events append-only כראיה משפטית, שעות שקט לשיווק (09:00-21:00 Asia/Jerusalem, לא בשבת), מסעות: עגלה נטושה (2 נגיעות, דיכוי על רכישה), win-back רבעוני, פקיעת קופונים נשארת ב-029, מכסות תדירות (שיווקית 1/יום, 3/שבוע), ייחוס הכנסות last-touch (notification_conversions, order_id ייחודי) + views.
- **`supabase/migrations/031_notifications.sql`** (טיוטה, idempotent, **לא הוחלה**): מרחיבה את 029 (exception אם 029 חסרה): enum notification_status מקבל dead/skipped (ADD VALUE IF NOT EXISTS, בלי שימוש ב-DDL באותה טרנזקציה), הרחבת notifications_outbox (attempts/next_attempt_at/locked_at/locked_by/provider/provider_message_id/delivered_at/to_address/is_marketing/journey_key/template_key/template_id/event_id + ערוץ whatsapp), notification_events + fn_emit_notification_event + טריגרים על orders (paid/refunded), order_items (shipped/delivered), coupon_codes (delivered/refunded), notification_templates + fn_activate_template, הרחבת user_notification_preferences (3 עמודות whatsapp, ברירת מחדל false), consent_events + fn_set_marketing_consent (משתמש, rate-limited) + fn_unsubscribe_marketing (service), channel_suppressions, notification_delivery_events + fn_ingest_delivery_event (bounce -> suppression, תלונה -> opt-out אוטומטי), fn_fanout_notification_events, fn_claim_notification_batch, fn_mark_notification_sent/failed/skipped, fn_requeue_dead_notification (admin), fn_in_marketing_window/fn_next_marketing_window/fn_marketing_frequency_ok, fn_enqueue_abandoned_cart_reminders, fn_enqueue_winback_reminders, notification_conversions, v_notification_kpis + v_journey_revenue (security_invoker), RLS מלא + audit על templates.
- **תנאים מוקדמים ל-031**: 029 חובה (נבדק ב-exception), וגם 011+025 (audit) ו-019 (rate limit). אין תלות ב-026/027/028/030 (אין טריגר על payments; order_paid מכסה קבלה). להחיל רק דרך MCP apply_migration, אחרי 029.
- **לא כלול**: קוד אפליקציה (worker שליחה, adapters לספקים, routes של webhooks וקישור הסרה חתום, דף העדפות), תוכן תבניות, סגירת מחירונים (המספרים הערכה), שינוי fn_enqueue_coupon_expiry_reminders של 029, price-drop (אין היסטוריית מחירים/wishlist), לוח חגים לשעות שקט.

Session 2026-07-08 - תכנון דומיין קטלוג, חיפוש עברית ו-SEO (design only, לא הוחל):
- **`docs/CATALOG-SEARCH-SEO-ARCHITECTURE.md`**: עץ קטגוריות עומק 2 עם הפרדת taxonomy/collection (אוספים חכמים עם `rule` jsonb ל"עד 99"/"חדש"/"דילים חמים"), וריאציות עם `variant_axes` + `option_values` (מחיר: variant.price ואז kenyon_price; price_modifier הוכרז DEPRECATED), מערכת מאפיינים attribute_definitions/category_attributes עם ערכים ב-jsonb + GIN, חוקי תצוגת הנחה (badge רק כש-full_price > kenyon_price, CHECK ב-DB), 5 מצבי מלאי נגזרים (untracked/in_stock/low_stock/out_of_stock/sold_out). חיפוש: FTS עם config simple + הרחבת שאילתה he_tsquery (הסרת אותיות שימוש ונרדפות) + trigram fallback לשגיאות כתיב, נוסחת דירוג 0.55 רלוונטיות / 0.15 fuzzy / 0.15 טריות / 0.10 מרג'ין / 0.05 featured, autocomplete, אפס-תוצאות עם לוג search_queries; ספי מעבר ל-Meilisearch: 12% zero-results או p95>250ms או 30k מוצרים. SEO: **הוכרע slugs לטיניים** (לא עברית ב-URL), URLs שטוחים (/products/[slug], /category/[slug], /coupons/[slug]), seo_redirects לרציפות מוורדפרס + trigger אוטומטי על שינוי slug (כולל קריסת שרשראות), JSON-LD בלי aggregateRating (אין ביקורות), canonical: פילטרים noindex+canonical לקטגוריה, pagination self-canonical, OG לוואטסאפ (תמונה <300KB + מידות מוצהרות). Listing: עימוד ממוספר (לא infinite scroll), URL הוא ה-state, קאשינג עם Cache Components של Next 16 (cacheTag פר מוצר/קטגוריה + revalidateTag ממוטציות אדמין).
- **`supabase/migrations/030_catalog.sql`** (טיוטה, idempotent, **לא הוחלה**): עמודות brand/search_keywords/seo_title/seo_description/low_stock_threshold/variant_axes/has_variants, search_vector generated על products + coupon_deals + אינדקסי GIN (FTS, trigram, attributes), טבלאות product_categories/attribute_definitions/category_attributes/search_synonyms/search_queries/seo_redirects, פונקציות he_tsquery/search_products/autocomplete_products/category_facets/log_search_query/touch_seo_redirect/record_slug_redirect, trigger עומק קטגוריות + backfill קטגוריות collection, RLS מלא. לא תלויה ב-026/027/028/029 (platform_percent מגונן בנוסח 027).
- **תנאים מוקדמים ל-030**: 016 (kenyon_price/name_he), 025 (audit fn). להחיל רק דרך MCP apply_migration.
- **שאלות פתוחות מרכזיות**: /product/[slug] (קיים בקוד) מול /products/[slug] (הוחלט: רבים; ה-trigger ב-030 כותב /products/); נדרש crawl מלא + ייצוא GSC של האתר הוורדפרסי הישן לפני מילוי seo_redirects; אישור שנשארים על אותו דומיין.

Session 2026-07-08 - ארכיטקטורת Super-App מובייל (design only, מסמך בלבד, אין מיגרציה):
- **`docs/SUPERAPP-MOBILE-ARCHITECTURE.md`**: החלטת פלטפורמה: PWA על ה-Next הקיים (לא React Native, לא native), עטיפות חנות בשלב מאוחר (TWA ל-Google Play, Capacitor ל-App Store רק כשמדדי iOS יצדיקו); ארכיטקטורת ורטיקלים plug-in עם ליבה משותפת: orders כמעטפת תשלום אוניברסלית (עמודת vertical עתידית), ארנק רק דרך fn_wallet_transfer עם wallet_reason + idempotency key בעלי namespace פר ורטיקל, memberships פר ורטיקל בתבנית supplier_members, registry ורטיקלים עם kill switch; ארנק קופונים offline-first (IndexedDB cache, רינדור QR מקומי מ-qr_token, סנכרון דלתא לפי updated_at, אימות Ed25519 offline בסורק וחד-פעמיות online בלבד, עקבי עם 027 ועם ACCOUNT-IDENTITY 4.2); push: נבנה על notifications_outbox + user_notification_preferences מ-029, תוספות עתידיות push_subscriptions + audit הסכמת שיווק לפי סעיף 30א לחוק התקשורת (חוק הספאם; שיווקי opt-in בלבד, תפעולי ברירת מחדל); deep links https בלבד + שיתוף WhatsApp דרך /r/[code] עם ייחוס 010 (לעולם לא משתפים qr_token); מסלול מיגרציה מדורג 0-4 בלי שכתוב קומרס באף שלב. 10 החלטות (D1-D10) + 8 שאלות פתוחות במסמך.
- אין תשתית PWA קיימת בריפו (אין manifest, אין service worker); מדריך PWA רשמי קיים ב-node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md.

Session 2026-07-08 - תכנון דומיין חשבון לקוח וזהות (design only, לא הוחל):
- **`docs/ACCOUNT-IDENTITY-ARCHITECTURE.md`**: Google OAuth (PKCE) עם התחברות רק בלחיצת תשלום, אסטרטגיית session (proxy.ts + getUser בלבד), מיזוג עגלת אורח race-safe דרך RPC עם advisory lock, מחיקת חשבון לפי דין ישראלי (פסאודונימיזציה + שמירת רשומות כספיות 7 שנים + ניקוי PII מ-audit_log), מפרט האזור האישי (/account: הזמנות, ארנק, קופונים עם QR + offline, אמצעי תשלום, פרופיל/כתובות, העדפות התראות), הקשחת payment_tokens (שלילת הרשאת עמודה על cardcom_token), תזכורות פקיעת קופון דרך notifications_outbox, מודל איומים.
- **`supabase/migrations/029_accounts.sql`** (טיוטה, idempotent, **לא הוחלה**): 3 טבלאות חדשות (user_notification_preferences, account_deletion_requests, notifications_outbox) + 2 enums + 7 פונקציות (fn_merge_guest_cart, fn_request/cancel/execute_account_deletion, fn_set_default_payment_token, fn_enqueue_coupon_expiry_reminders, create_default_notification_prefs) + הקשחת payment_tokens + unique חלקי על carts.profile_id + RLS מלא + audit. תלויות: 001/003/008/009/019/025 בלבד, אין תלות ב-026/027/028.
- **ממצא אבטחה ב-001**: policy בשם "payment_tokens: owner all" מאפשר ללקוח לקרוא cardcom_token גולמי ולכתוב שורות. 029 מחליפה אותו.
- **ממצא race ב-cart.ts**: mergeGuestCart הקיים הוא read-merge-write בלי נעילה; 029 מחליפה ב-fn_merge_guest_cart.
- הערה: הריפו על Next 16.2.4 (proxy.ts במקום middleware.ts), בניגוד לבריפים שמדברים על Next 15.

Session 2026-07-08 - תכנון מלא של פורטל ספקים ומימוש קופונים (design only, לא הוחל):
- **`docs/SUPPLIER-REDEMPTION-ARCHITECTURE.md`**: מודל כסף (platform_percent פר מוצר עם fallback ל-suppliers.commission_percent), onboarding עם supplier_applications + אישור אדמין, חברות דרך supplier_members (owner/manager/scanner) במקום role, פרטי בנק ישראליים בטבלה נפרדת (owner בלבד), מימוש קופון עם QR חתום Ed25519 + UPDATE אטומי יחיד כהגנת מרוץ, coupon_scan_events append-only, מנוע payout חודשי עם snapshot בלבד, reconciliation מול Cardcom, מודל איומים מלא.
- **`supabase/migrations/027_suppliers.sql`** (טיוטה, idempotent, **לא הוחלה**): 9 טבלאות/הרחבות + 8 enums + 12 פונקציות (redeem_coupon, update_shipping_status, approve_supplier_application, generate_payout_statement ועוד) + RLS מלא + audit triggers + bucket supplier-docs.
- **באג שהתגלה ב-014**: policy בשם "products: vendor read own" משווה products.supplier_id (מפנה ל-suppliers) מול vendors.id. לא מחזיר שורות. 027 מחליפה אותו ב-policy מבוסס supplier_members.
- **תנאים מוקדמים ל-027**: 016 (name_he), 019 (rate limit), 025 (audit fn) חייבים להיות מוחלים. להחיל רק דרך MCP apply_migration.

Session 2026-07-08 - מיגרציה 025 קונסולידציה הוחלה על המרוחק (Phase 3 סגור):
- **`025_consolidation.sql` הוחל** דרך Supabase MCP `apply_migration` על `ixvwfbuvfxxsjiywhbbb` (ACTIVE_HEALTHY). idempotent, מקור אמת ל-RLS: `003_rbac.sql`.
- **created_by** מאומת קיים על `products`, `categories`, `coupons`, `coupon_deals` (products/categories כבר היו איתו מ-005; ל-coupons ה-ALTER היה no-op כי כבר קיים).
- **content_uploader RLS**: `products` עם SELECT/INSERT/UPDATE own (בלי DELETE, מחיקה admin-only דרך 014); `categories` עם SELECT own בלבד (INSERT/UPDATE/DELETE נשארים admin-only לפי 012). 4 policies מאומתות ב-`pg_policies`.
- **איחוד audit**: 58 שורות (51 INSERT + 7 UPDATE) הוגרו מ-`admin_audit_log` ל-`audit_log` עם מיפוי enum (INSERT->created, UPDATE->updated); `admin_audit_log` נמחקה (DROP CASCADE); `audit_log_trigger_fn()` שוכתבה לכתוב ל-`audit_log` **לפני** ה-DROP כדי לא לשבור כתיבות עתידיות. אפס איבוד שורות.
- **12 storage policies** מאומתות קיימות (product-images / vendor-logos / category-icons x4), כולל תוספת האדמין מ-020 על product-images.
- **DRIFT שהתגלה**: בניגוד לקבצי המיגרציה (008 מוחקת `coupons`), ב-DB החי הטבלה `coupons` **קיימת** ועם `created_by`. יש פער בין קבצי המיגרציה למצב הפרודקשן. שווה בדיקה נפרדת.

Session 2026-06-26 — Phase 3 (Admin Panel) הושלם + מבנה דף מוצר סופי הוחלט:
- **Phase 3 (Admin Panel) הושלם** — כל דפי הניהול מחווטים ועובדים.
- **מבנה דף המוצר הסופי הוחלט:** מבוסס Groupon (AMC) + Electro. מקורות ייחוס שמורים ב-`refs/groupon_amc_deal.mhtml` + `refs/electro_product_page.mhtml` (gitignored, מקומיים בלבד — לא בריפו).
- **הבהרה:** קבצי ה-refs הם ייחוס **עיצובי בלבד** — אין לייבא מהם דאטה. טבלת `products` נשארת כמות שהיא (31 מוצרים). בונים את דף המוצר לפי המבנה, לא מייבאים את AMC/Electro.
- **קובץ אב למילוי:** `docs/product-page/KenyonExpress_קובץ_אב_דף_מוצר.docx` (tracked בריפו). Ofir ממלא אותו ואז commit מחדש עם הגרסה המלאה.
- **Next:** Ofir ממלא את קובץ האב → בונים `/products/[slug]` לפי המבנה שיתקבל.
- **שדות חדשים שיידרשו בטבלת `products`** (טרם קיימים — ראו סכמה חיה בת 26 עמודות): `city`, `business_whatsapp`, `promo_code`, `options[]`, `sold_count`, `redemption_steps`, `business_hours`, `waze_coords`, + supplier fields.

Session 2026-06-26 — Phase 3 admin dashboard wired:
- פאנל הניהול מחווט ועובד ב-`/admin/dashboard` (קובץ `src/app/(admin)/admin/dashboard/page.tsx`; `(admin)` הוא route group ולכן לא ב-URL).
- StatsCards מציגים נתונים אמיתיים מ-DB (8 קופונים, 31 מוצרים).
- RBAC guard פעיל: `(admin)/layout.tsx` עבר מ-`requireStaffSession` ל-`requireAdminSession` (admin/super_admin בלבד). אומת: `GET /admin/dashboard` → 307 → `/login?next=%2Fadmin%2Fdashboard`. commit `b4539d8`, pushed.

Session 2026-06-26 — פתרון 401 (מפתחות Supabase):
- ב-`.env.local` היה `NEXT_PUBLIC_SUPABASE_ANON_KEY` חתוך ומשובש (32 תווים, בלי נקודות, header פגום) → גרם ל-401.
- אחרי `Claude Code /login`: הוחלף ה-anon במפתח JWT מלא ותקין (role=anon, ref `ixvwfbuvfxxsjiywhbbb`, exp 2036), ונוסף `SUPABASE_SERVICE_ROLE_KEY` מלא (role=service_role) — **בלי** קידומת `NEXT_PUBLIC_` (סוד server-side בלבד).
- אומת: `git check-ignore .env.local` → מוגנן ב-gitignore (לא נכנס ל-git).
- אומת נקי: `pnpm dev` → `✓ Ready` על `localhost:3000`, `GET /` → 200, probe ישיר ל-Supabase REST עם ה-anon → 200. אין 401.

Session 2026-06-23 — שחזור פרויקט + שיטוח מבנה:
- הקוד שוחזר מ-`origin/phase5/homepage` (commit `92b858a`) אחרי איבוד מקומי. עץ העבודה היה מקונן (`kenyonexpress/kenyonexpress/`) — **שוטח**: כל הקבצים הועברו לשורש `/Users/ofir/kenyonexpress-web/kenyonexpress`, ה-scaffold הישן (13 tsx, eslint) הוסר. כעת מבנה יחיד ושטוח.
- `.env.local` שוחזר מגיבוי (פרויקט Supabase `ixvwfbuvfxxsjiywhbbb`) → השורש; מוגנן ב-gitignore.
- **אישור pnpm builds:** `pnpm-workspace.yaml` תוקן ל-`allowBuilds: {biome,parcel/watcher,swc/core,esbuild,sharp: true}` (pnpm 11.1.2 משתמש ב-`allowBuilds`, לא `onlyBuiltDependencies`). אזהרת `ERR_PNPM_IGNORED_BUILDS` נעלמה; `pnpm dev` עובד ישירות.
- אומת: `pnpm dev` → `localhost:3000` HTTP 200, כותרת "קניון EXPRESS", `.env.local` נטען.
- **חוקי פרויקט קבועים נוספו ל-CLAUDE.md** (נתיב יחיד, אין עותקים כפולים, pwd לפני כל פעולה, push מיידי אחרי commit).

Session 2026-06-22 — Admin dashboard shell:
- `(admin)/layout.tsx`: RBAC `requireStaffSession` (admin/super_admin/content_uploader) → `/login`, sidebar, RTL, Heebo via `font-sans`, צבע `#fed700`
- `(admin)/dashboard/page.tsx`: StatsCard עם ספירה חיה מ-`products`, `orders`, `coupon_deals`
- `requireStaffSession` + `isStaffRole` ב-`lib/admin/rbac.ts`; `/admin` מפנה ל-`/dashboard`
- AdminSidebar + StatsCard עודכנו ל-`#fed700`

Session 2026-06-22 — החלת 019/020/021 על המרוחק דרך Supabase MCP:
- הפרויקט `ixvwfbuvfxxsjiywhbbb` כבר ACTIVE_HEALTHY (לא INACTIVE כפי שתועד). יש דאטה: 12 קטגוריות, 31 מוצרים.
- `019` הוחל: טבלת `public.user_rate_limits` + `check_user_rate_limit` + `cleanup_user_rate_limits` (verified `to_regclass` not null).
- `020` הוחל: policies אדמין ל-bucket `product-images` (idempotent).
- `021` הוחל: buckets `products` + `coupons` נוצרו (buckets עכשיו: category-icons, coupon-images, coupons, product-images, products, vendor-logos) + policies.
- הוחל דרך `apply_migration` ולא `db push`: היסטוריית המיגרציות במרוחק מכילה רק 2 רשומות (auth_rate_limits, storage_buckets) בעוד שהסכמה כבר קיימת — `db push` היה נכשל על "already exists".
- git: עץ העבודה נקי, אין commits לא-דחופים. 021 כבר committed (בניגוד לתיעוד הקודם).

Session 2026-06-20 — מיגרציות rate-limit + storage:
- `019_user_rate_limits.sql` (commit `77cf701`, pushed): טבלת `public.user_rate_limits` + `check_user_rate_limit(user_id, action, limit, window)` SECURITY DEFINER, RLS ללא policies; helper `checkUserRateLimit()` ב-rate-limit.ts + טיפוס ב-database.ts. additive ל-002 (IP-keyed).
- `020_storage_product_images_admin.sql` (commit `a1aa413`, pushed): הוספת `public.is_admin()` ל-policies של bucket `product-images` (admin ProductForm). במקום עריכת 004 שכבר רץ.
- `021_products_coupons_buckets.sql` (לא committed עדיין): buckets חדשים `products` + `coupons`, public read, גישה `has_role('content_uploader') OR is_admin()`. נכתב כתחליף נכון לניסיונות לשכתב את 004 (באג `auth.role()='content_uploader'` = deny-all).
- כל ניסיונות `migration up`/`db push` נכשלו: אין DB נגיש (Docker down מקומית; remote unlinked + paused). 002/003/004 לא שונו (שכתובים שבורים נדחו).

Session 2026-06-20 — דף קטגוריה (commit `b5139e8`):
- `(store)/category/[slug]/page.tsx`: resolve לפי slug, breadcrumb עם הורה, צ'יפים לתת-קטגוריות, גריד מוצרים
- מיון `?sort=` (newest/price_asc/price_desc/name) דרך `components/category/CategorySort.tsx` (client)
- pagination `?page=` עם `count: 'exact'` ו-`components/category/Pagination.tsx` (חלון עמודים קומפקטי)
- empty state + `notFound()` לקטגוריה חסרה/לא פעילה
- `type-check` + `biome` נקיים. בדיקה חיה חסומה: פרויקט Supabase במצב INACTIVE (queries עושים timeout → 404)

Session 2026-06-20 — Admin refactor (commit `6f96164`):
- `DataTable` גנרי (מיון/חיפוש) + `CategoriesTable`/`CouponsTable`/`ProductsTable`/`UsersTable`/`CouponForm`
- shell עבר מ-`(admin)/admin/layout.tsx` ל-`(admin)/layout.tsx`
- `lib/admin/page-params.ts` עם סכמות zod
- rename מיגרציה `007_categories_icon_url` → `0075` (התנגשות prefix עם `007_orders`)
- `type-check` עובר נקי

Session 2026-06-19 — Homepage 1:1 מול `ke_live_singlefile.html`:
- `scripts/compare.mjs` משתמש ב-`ke_live_singlefile.html`; `refs/live.png` מול `refs/mine.png` ב-1440px
- `HeroSection`: סליידר בלבד 422px, `HERO_SINGLEFILE_SLIDES`, rs-19 פעיל; בלי סיידבר/באנרים (sf-hidden במקור)
- `HeroSlider`: active slide = rs-19 (אפליקציה בקרוב)
- `CategoryStrip`: 5 קטגוריות בלבד
- `BenefitBar`: 5 פריטים מ-`.features-list`, מסגרת `#ddd` radius 8px
- `DealsOfTheDay`: גריד 4 עמודות, 6 מוצרים סטטיים מ-`KE_LIVE_DEALS` + השלמה מ-DB, בלי כותרת "דילים של היום"
- `(store)/page.tsx`: hero → categories → benefits → grid (בלי `CategoryProductSection`)
- `ke-live-deals-data.ts`: 6 מוצרים בסדר DOM (כולל קופון טסט 8836)
- Header/TopBar: לוגו + ₪0 + עגלה; TopBar 4 פריטים (בלי חיפוש, לפי החלטת פרויקט)

commit: `feat: homepage 1:1 match with live source`

## In Progress
ממתין ל-Ofir: מילוי קובץ האב (`refs/KenyonExpress_קובץ_אב_דף_מוצר.docx`) לפני בניית `/products/[slug]`.

## Blocking Issues
- none חוסם. הערה: היסטוריית המיגרציות במרוחק לא מסונכרנת (2 רשומות מול 21 קבצים מקומיים). אין להריץ `supabase db push` למרוחק — ייכשל על "already exists". להחיל מיגרציות חדשות נקודתית דרך MCP `apply_migration` או `supabase migration repair`.
- Docker מקומי עדיין לא רץ (לא רלוונטי כל עוד עובדים מול המרוחק).

## Next Task
בניית `/products/[slug]` לפי מבנה דף המוצר הסופי (Groupon AMC + Electro), אחרי ש-Ofir ממלא את קובץ האב ב-`refs/`. כולל הוספת שדות חדשים ל-`products`: city, business_whatsapp, promo_code, options[], sold_count, redemption_steps, business_hours, waze_coords, supplier fields.

## Active Branch
phase5/homepage

## Working Directory ⛔ נתיב יחיד ונכון
`/Users/ofir/kenyonexpress-web/kenyonexpress` — שורש הפרויקט (כאן `package.json`, `.git`, `src/`). מבנה שטוח, **אין מקונן**.

**חוקים קבועים (גם ב-CLAUDE.md):**
1. אסור עותקים כפולים של הפרויקט (`* copy`, `src copy`, מבנה מקונן). גיבוי = git/GitHub בלבד.
2. אסור להריץ פקודות מתיקיות אחרות. לפני כל פעולה — לוודא `pwd` = הנתיב לעיל.
3. כל `git commit` מחייב `git push` מיידי ל-`origin phase5/homepage` כגיבוי.

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co

---
## History

### 2026-07-08 - מיגרציה 025 consolidation הוחלה על המרוחק
- הוחל דרך Supabase MCP `apply_migration` על `ixvwfbuvfxxsjiywhbbb` (ACTIVE_HEALTHY)
- created_by re-assert (products/categories/coupons) + content_uploader RLS (products CRUD-minus-delete, categories select-only) + איחוד audit (58 שורות admin_audit_log -> audit_log, טבלה ישנה נמחקה, trigger fn שוכתבה) + 12 storage policies - הכול verified
- drift התגלה: `coupons` קיימת ב-DB החי למרות ש-008 מוחקת אותה בקבצים

### 2026-06-22 — מיגרציות 019/020/021 הוחלו על המרוחק
- הוחל דרך Supabase MCP `apply_migration` (לא `db push`, בגלל היסטוריה לא מסונכרנת)
- user_rate_limits + buckets products/coupons + product-images admin policies — verified
- DB מרוחק ACTIVE עם דאטה (12 קטגוריות, 31 מוצרים); חסם ה-DB הקודם בוטל

### 2026-06-19 — Homepage 1:1 match with live singlefile
- מבנה דף, hero rs-19, 5 קטגוריות, benefits, גריד מוצרים לפי faf8583
- compare loop: `node scripts/compare.mjs` (PLAYWRIGHT_BROWSERS_PATH ל-cache מקומי)

### 2026-06-12 — CategoryNav removed, BenefitBar frame, ProductCard electro values
- commits על `phase5/homepage` לפני סגירת 1:1

### 2026-06-09 — Product catalog + hero 5 slides + foundation
- 31 מוצרים ב-DB, `scripts/compare.mjs` הוקם
