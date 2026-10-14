# -*- coding: utf-8 -*-
# UX23: the STATE.md edit (Updated line, the previous line kept as קודם, the
# decisions paragraph before UX22's). A file and not a heredoc because a
# python heredoc with Hebrew dies on the \xd7 encoding check.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-14 23:20 (UX22'), lines[2][:40]
old_updated = lines[2]
new_updated = (
    'Updated: 2026-10-15 00:20 (UX23 חלון הכניסה: לשוניות אימייל+סיסמה / קוד ב-SMS, כפתור מפתח (‏Passkey), קישור לאימייל כ-fallback. '
    '**נמדד לפני** (‏logs/ux23/before.json, ה-build הקיים של ‏444ed8051 ב-380/768/1440 על ‏3364, אנונימי, ‏/ ואז ‏/login): לחיצה על "התחברות" בפס העליון עזבה את הדף אל ‏/login בכל רוחב (אין שום חלון); '
    '‏/login: שני טפסים (‏Google, אימייל+סיסמה), בלי לשוניות ובלי ‏SMS (‏PHONE_AUTH_ENABLED לא מוגדר), המפתח ‏42px, "כניסה" ‏40px, הקישור לאימייל כפתור טקסט ‏20px. '
    '**עכשיו**: ‏lib/auth/login-dialog.ts (אירוע ‏ke:login-dialog ‏cancelable, ‏openLoginDialog מחזיר אם מארח תבע, ‏nextFromLoginHref, ‏currentLocationNext, ‏isPlainActivation); '
    '‏components/auth/LoginLink (אותו ‏<a href="/login..."> שתמיד היה; בלחיצה רגילה משגר את האירוע עם ה-next של הקישור או הדף הנוכחי + query ועוצר ניווט רק כשנתבע; ‏modifier, כפתור אמצעי, קבוצה בלי מארח ובלי ‏JS, כולם מנווטים); '
    '‏components/auth/LoginPanel (גוף אחד לדף ולחלון: ‏Google, מפתח, ואז ‏role=tablist/tab/tabpanel עם ‏tabindex נודד, חיצים לפי כיוון (‏RTL: שמאלה מתקדם), ‏Home/End, הפאנל השני ‏hidden ולא מפורק, לשונית ‏SMS רק כש-phoneAuthEnabled(), הקישור לאימייל מתחת ללשוניות וכישלון המפתח פותח אותו; כל ‏id עם קידומת ‏login-/login-dialog-; כל כפתור ‏44px); '
    '‏components/auth/useLoginDialogRequest (תובע מההידרציה: נמדד ב-/products שלחיצה מיד אחרי ‏load פתחה את הדף ולא את החלון כי ה-chunk טרם הגיע); ‏DeferredLoginDialog (‏ssr:false, מחומם ב-idle) מורכב ב-DeferredStoreChrome וב-(main)/layout עם ‏phoneEnabled מהשרת; '
    '‏components/auth/LoginDialog (‏<dialog open> במכניקת מגירת העגלה: ‏overlay, ‏Escape, נעילת ‏body כ-class, עטיפת ‏Tab, פוקוס על הפאנל המתויג, החזרה לפותח, סגירה בשינוי מסלול, ו-currentUserId פעם אחת ל"אתם כבר מחוברים" + לאזור האישי); ‏src/styles/login-dialog.css ב-root bundle (‏BEM, טוקנים, ‏safe-area). ‏PasskeyLoginButton ו-PhoneOtpForm עברו ל-components/auth. '
    '**נמדד אחרי** (‏logs/ux23/after.json, ‏build טרי על ‏3364 עם ‏PHONE_AUTH_ENABLED=true): הלחיצה שומרת על ה-URL ופותחת את החלון בכל רוחב (‏350x651 ב-x=15 y=124.5 ב-380; ‏416x651 ב-768 ו-1440), ‏aria-modal, סגירה ‏44x44, ‏overflow hidden, פוקוס על ה-DIALOG, ‏next="/" בטפסים, רצועת לשוניות בפנים (‏144x44, ‏177x44 מ-768), כל שבעת הכפתורים ‏44, ‏Escape סוגר ומחזיר פוקוס ל-"התחברות", ‏12 ‏Tab כולם בפנים, ה-overlay סוגר; '
    '‏/login: רצועה ‏298x54 (‏334x54) של שתי לשוניות ‏142x44 (‏160x44), לחיצת ‏SMS מציגה ‏login-otp-phone ומסתירה את פאנל האימייל, ‏ArrowRight חוזר; אפס שגיאות דף. '
    'נעוץ ב-lib/auth/login-dialog.test (11), ‏LoginLink.test (6), ‏LoginPanel.test (13), ‏useLoginDialogRequest.test (4), ‏LoginDialog.test (8), ‏e2e/login-dialog.spec.ts (‏7 מקרים, ‏14/14 ב-chromium + mobile-chrome, כולל כניסה אמיתית דרך החלון שחזרה ל-/products); '
    'שכני ‏e2e (‏topbar, auth, header, skip-link, home): ‏50 עברו, ‏6 נכשלו וכולם קדמו ל-goal (ארבעת ה-skip-link וה-combobox על באנר ההסכמה שאין לו עוגייה במפרטים האלה, ושער "גיליון אחד" שכבר נכשל ב-logs/ux10 ו-ux13 עם אותם שלושה ‏chunks: הפונט, ‏globals, ויבוא ה-root). '
    'שערים: ‏vitest ‏874 קבצים / ‏10094 ירוקים, ‏type-check ו-lint נקיים, ‏build טרי ירוק (שער ה-csp נקי). ‏docs/AUTH-MODEL.md §11 מתעד; ‏COMPONENT-QUEUE קיבל שורת ledger (UX23). '
    'הפירוט ב"החלטות שהתקבלו לבד (UX23)". המשך מ: ‏UX24)'
)
lines[2] = new_updated
lines.insert(3, 'קודם: ' + old_updated[len('Updated: '):])

decisions = (
    '**החלטות שהתקבלו לבד (UX23, 00:20):** (1) **חלון ולא מסלול מיירט (‏intercepting route)**: ‏`(.)login` היה דורש ‏slot מקביל בכל layout שמציג חנות (שלושה) ומשכפל את הדף; אירוע אחד + מארח אחד + אותו ‏LoginPanel נותן את אותה תוצאה בלי לגעת במבנה ה-app, והדף ‏/login נשאר היעד של כל קישור. '
    '(2) **הקישור נשאר ‏<a href="/login">**: ‏header-icons.test מחייב את המחרוזת ב-TopBar בלבד, ו-TopBar.test מחייב ‏hover:text-heading-hover על ה-a; ‏LoginLink מעביר ‏className ומחליף רק את ה-onClick. '
    '(3) **התביעה ב-hook שמתהדרר, לא במודול העצל**: נמדד ב-e2e על ‏/products שלחיצה מיד אחרי ‏load ניווטה ל-/login; ‏useLoginDialogRequest קטן מספיק לשבת ב-shell, וה-chunk מחומם ב-requestIdleCallback. '
    '(4) **‏<dialog open> ולא ‏showModal()**: ‏jsdom ‏25 לא מממש ‏showModal (נבדק), ומגירת העגלה והתפריט כבר נושאות את אותה מלכודת ידנית; הפוקוס על הפאנל (‏aria-labelledby) ולא על שדה האימייל, כדי שמקלדת הטלפון לא תכסה את ‏Google והמפתח. '
    '(5) **לשוניות רק כשיש שתיים**: לשונית ‏SMS מרונדרת רק כש-PHONE_AUTH_ENABLED דולק (‏AUTH-MODEL §10: ‏external_phone_enabled=false בפרודקשן), אחרת הטופס בלי רצועה; הפאנל המוסתר ‏hidden ולא מפורק כדי שמספר שהוקלד ישרוד. '
    '(6) **‏phoneAuthEnabled() נקרא ב-StoreShell בזמן בקשה**: נמדד שהחלון הציג את לשונית ה-SMS כשהשרת רץ עם המשתנה בלי build מחדש, כלומר הדף והחלון עונים מאותו משתנה באותו רגע. '
    '(7) **מחובר שלוחץ "התחברות"**: הקישור סטטי (קריאת סשן ב-TopBar הופכת כל מסלול ל-dynamic), אז החלון שואל ‏currentUserId פעם אחת אחרי הפתיחה ומחליף את הטופס ב"אתם כבר מחוברים" + קישור לאזור האישי; הדף ‏/login עצמו לא השתנה. '
    '(8) **‏getByLabel מדויק במפרטי ה-auth**: ‏tabpanel שמתויג בלשונית "אימייל וסיסמה" גרם ל-getByLabel(\'אימייל\') להתאים לשני אלמנטים; ‏auth-session.ts ו-auth.spec.ts קיבלו ‏exact: true (נרשם בזיכרון). '
    '(9) **ששת כשלי השכנים לא תוקנו**: כולם קדמו ל-goal (באנר ההסכמה כטופס ראשון, ושער "גיליון אחד" שכבר נכשל ב-ux10/ux13 עם אותם שלושה ‏chunks); תיקון שער הגיליונות הוא goal נפרד ולא שינוי בחשאי.'
)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX22'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('STATE.md updated')
