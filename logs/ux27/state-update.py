# -*- coding: utf-8 -*-
# UX27: the STATE.md edit (Updated line, the previous line kept as קודם, the
# decisions paragraph before UX26's). Args: vitest summary, e2e summary.
import io, sys

VITEST = sys.argv[1]  # e.g. "886 קבצים / 10190"
E2E = sys.argv[2]     # e.g. "8/8"

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-15 04:10 (UX26'), lines[2][:40]
old_updated = lines[2]
new_updated = (
    'Updated: 2026-10-15 05:20 (UX27 שלדי טעינה: כרטיסי מוצר, רשת קטגוריות, קופה, דפי חשבון. '
    '**נמדד לפני** (‏logs/ux27/before.json, ה-build הקיים של ‏37482ca67 ב-380/768/1440 על ‏3364, הלקוח המזורע לרגעי החשבון, כל אזור נדגם כל ‏~16ms מהמחווה ועד התוכן): '
    '**חשבון**: לחיצה על הטאב "ההזמנות שלי" השאירה את הסקירה במקומה ‏2289 / 2530 / 2609ms בלי שום סימן שהלחיצה נחתה (ה-Suspense של ה-layout סביב ‏children היה ‏`fallback={null}`, ו-boundary מאונט שומר את התוכן הישן לאורך ‏transition), וטעינה ישירה של ‏/account/orders שלחה ‏15.6KB ראשונים ב-313ms עם **עמודה ריקה** עד הדף ב-2326ms. '
    '**עגלה**: ה-HTML הסטטי של ‏/cart רינדר את מצב "ריק", ולכן קונה עם שורה בעגלה קרא את הבאנר הצהוב "סל הקניות שלך ריק כרגע" ‏1667 / 2043 / 1501ms בכל ביקור עד שתשובת ‏/api/cart הגיעה. '
    '**ארכיון**: בזמן שעמוד שני נטען (‏589 / 1193 / 1179ms) רק תווית הכפתור השתנתה ל"טוען מוצרים…" והרשימה לא החזיקה כלום. '
    '**לחיצת קופה**: ה-URL השתנה ‏306 / 431 / 724ms אחרי "המשך לתשלום" ודף העגלה עמד בלי תגובה. '
    '**אריח קטגוריה** מהבית: כבר מיידי (‏CategoryPageFallback המוקדם-טעון עם ‏24 כרטיסי שלד ב-11-20ms), נשאר כמות שהוא. '
    '**עכשיו**: קופסת שלד **אחת** לכל האתר, ‏`.ke-skeleton` ב-globals.css (‏#efefef שטוח; תחת ‏prefers-reduced-motion: no-preference סוויפ מימין לשמאל ‏1.4s; הקוראים קובעים רק גודל), ו-`.category-skeleton` שומר רק את המידות המדודות (הפולס שלו הוסר). '
    '**חשבון**: ‏components/account/AccountContentSkeleton (קופסת שורת הכותרת, תת-כותרת, שלוש מסגרות ‏.account-card עם פס כותרת, שתי שורות ופקד ‏36px; ‏`aria-busy`, משפט ‏sr-only אחד, כל פס ‏aria-hidden) מרונדר על ידי ‏**src/app/(account)/account/loading.tsx החדש**, ה-boundary **היחיד** מעל העמודה; ה-`<Suspense>` של ה-layout סביב ‏children **הוסר**, כי ‏boundary שם ועוד ‏loading.tsx היו ‏23 ‏shells של חשבון שנדחו בשער ה-csp (ה-boundary החיצוני מסתיים בזמן ה-prerender ו-Fizz כותב את ה-reveal runtime ‏$RB/$RV בלי ‏nonce לתוך ה-HTML הסטטי; ‏logs/ux27/build.log). '
    '**עגלה**: ‏components/cart/CartPageSkeleton (אותן מחלקות ‏.cart-page__grid / ‏.cart-line / ‏.cart-sidebar עם פסי ‏.cart-pending__*, שורה לכל שורה במראה, ‏1..3, ‏`data-cart-skeleton`, ‏`aria-busy`) מרונדר ב-CartPageView כל עוד ה-store לא ‏settled, כאשר ‏settled = ‏serverConfirmed || ‏fallbackActive || (המראה נקרא && ‏mirrorCount === 0); "נקרא" הוא ‏hasHydrated() של ה-persist middleware דרך ‏useCartMirrorHydrated() החדש ו**לא** שדה ב-store, כי שדה היה ‏set() בהידרציה וה-middleware כותב את מפתח המראה בכל ‏set (‏cart-line-remove-animation.test תפס את הניסיון הראשון: ביקור ראשון כתב מראה לעגלה שלא קיימת). '
    '**לחיצת קופה**: ‏CartCheckoutButton נושא ‏`data-checkout-link`, טבעת ‏1em קבועה (‏.checkout-link__hint, ‏absolute כך שהתווית לא זזה, ‏opacity + ‏spin לפי ‏data-link-pending מ-useLinkStatus) ו-`<output aria-live>` שאומר "עוברים לקופה…" בזמן הניווט; קישור אחד, ארבעה משטחים. '
    '**ארכיון**: ‏CatalogGrid מצרף ‏`<li data-pending-card aria-hidden>` עם ‏CategoryCardSkeleton (ייצוא חדש) לכל מוצר שבדרך, ‏min(עמודים בדרך × 24, סה"כ − מוצג) ולכן העמוד האחרון של ‏46 הוא ‏22 קופסאות, ‏`<ul aria-busy>`. '
    '**נמדד אחרי** (‏build טרי על ‏3364; ‏logs/ux27/after.json, ‏after-cart.json, ‏e2e.log): לחיצת הטאב מציירת את השלד ב-19ms בכל רוחב (עמודה ‏603px, ‏aria-busy) וההזמנות מחליפות אותו; ה-flush של המעטפת בטעינה ישירה נושא את השלד והדף בא אחריו (‏490ms / ‏5161ms בריצת ‏Nano איטית); ‏/cart מציג את השלד מהפרסור הראשון (‏18 / 33 / 22ms) עד השורות ב-1913 / 1376 / 1499ms והבאנר הריק לא מוצג אף פעם; טבעת הקופה ‏pending ‏0-1ms אחרי הלחיצה עם הטקסט החי; קופסאות הארכיון נעוצות ב-e2e עם עמוד שני מושהה ‏1.5s; אריח הקטגוריה נשאר מיידי; אפס שגיאות דף בכל רוחב. '
    'נעוץ ב-AccountContentSkeleton.test (5, כולל הרכבת ‏loading.tsx ובדיקת המקור "אין ‏boundary שני"), ‏CartPageSkeleton.test (3), ‏cart-page-loading-state.test (6), ‏store.test (+1: ‏hasHydrated מתהפך בלי כתיבה), ‏CatalogGrid.test (+22 קופסאות בזמן טעינה, ‏0 אחרי, ‏aria-busy), ‏cart-checkout-button.test (+1) ו-e2e/loading-skeletons.spec.ts (‏4 מקרים × ‏chromium + mobile-chrome, ‏' + E2E + ', המצבים נרשמים ב-MutationObserver מהסקריפט הראשון). שערים: ‏vitest ‏' + VITEST + ' ירוקים, ‏type-check ו-lint נקיים, ‏build טרי ירוק (שער ה-csp נקי, ‏278 shells), שער הבית ‏REFUSED (‏live side is our-build, כמו ‏UX22-26). ‏docs/ARCHITECTURE-CART-CHECKOUT.md §2.1.1, ‏ARCHITECTURE-ACCOUNT-AREA.md (UI), ‏ARCHITECTURE-CATALOG-SEARCH-SEO.md §4.2 ו-COMPONENT-INVENTORY (מקטע ‏account, ‏cart, ‏category) מתעדים; ‏COMPONENT-QUEUE קיבל שורת ledger (UX27). הפירוט ב"החלטות שהתקבלו לבד (UX27)". המשך מ: ‏UX28)'
)
lines[2] = new_updated
lines.insert(3, 'קודם: ' + old_updated[len('Updated: '):])

decisions = (
    '**החלטות שהתקבלו לבד (UX27, 05:20):** (1) **מודדים לפני שבונים**: ארבעה רגעי טעינה נדגמו כל ‏~16ms (‏logs/ux27/probe.mjs) ורק שלושה נמצאו חסרים; אריח הקטגוריה מהבית כבר מיידי בזכות ה-prefetch של ‏CategoryPageFallback, ולא נוסף לו דבר. '
    '(2) **‏loading.tsx רק היכן שאין חוזה ‏404**: ‏loading.tsx עוטף את הדף ב-Suspense, ולכן ‏slug מת היה עונה ‏200 (‏category/[slug] ו-product/[slug] מתעדים את המדידה הזאת); תחת ‏/account שני הדפים הדינמיים כבר זרמו תחת ה-boundary של ה-layout, כך שקוד הסטטוס לא השתנה. '
    '(3) **‏boundary אחד, לא שניים**: ה-build הראשון נפל בשער ה-csp על ‏23 ‏shells של חשבון (‏$RB/$RV בלי ‏nonce) כי ה-Suspense של ה-layout הסתיים בזמן ה-prerender כשילדו הוא ה-fallback של ‏loading.tsx; ה-Suspense של ה-layout הוסר ו-AccountContentSkeleton.test בודק במקור שהוא לא חוזר. '
    '(4) **"ריק" הוא פסק דין**: עד שהשרת, ה-fallback של המכשיר או מראה שנקרא אומרים משהו, עגלה ריקה היא עגלה בטעינה; ה-HTML הסטטי של ‏/cart נושא עכשיו שלד ולא באנר. '
    '(5) **דגל ההידרציה לא ב-store**: הניסיון הראשון (‏onRehydrateStorage → ‏set) נכשל ב-cart-line-remove-animation.test כי ‏persist כותב ל-localStorage בכל ‏set, וכך כל ביקור ראשון היה כותב מראה לעגלה שלא קיימת; ‏useCartMirrorHydrated() קורא את ‏persist.hasHydrated() ו-onFinishHydration בלי כתיבה. '
    '(6) **טבעת ולא ‏loading.tsx לקופה**: ‏/checkout כבר מחזיק ‏Suspense משלו עם ‏CheckoutShell; הפער הנמדד היה בין הלחיצה ל-URL (‏306-724ms, המעטפת לא תמיד מוקדמת-טעונה), והתרופה המתועדת של ‏Next לכך היא ‏useLinkStatus; הטבעת ‏absolute בגודל קבוע כדי שהתווית לא תזוז. '
    '(7) **שלד אחד לאתר**: ‏`.ke-skeleton` ב-globals.css (סוויפ מימין לשמאל, כיוון הקריאה) ולא קובץ ‏css חדש, כדי לא לשנות את ספירת גיליונות הסגנון של דף הבית; ‏`.category-skeleton` איבד את הפולס שלו ושומר מידות בלבד. '
    '(8) **ה-probe של העגלה נכתב מחדש** (‏probe-cart.mjs) כי השלד משתמש ב-`.cart-line` לגאומטריה והדגימה הראשונה ספרה שורות שלד כשורות; שורה אמיתית היא ‏`.cart-line__name`. '
    '(9) **הגיבוי היומי לא הורץ שוב**: ‏kenyonexpress-backup-2026-10-15-0052 קיים ושלושה נשמרים. '
)
anchor_idx = None
for i, line in enumerate(lines):
    if line.startswith('**החלטות שהתקבלו לבד (UX26, 04:10):**'):
        anchor_idx = i
        break
assert anchor_idx is not None
lines.insert(anchor_idx, decisions)
lines.insert(anchor_idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated')
