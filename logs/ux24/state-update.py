# -*- coding: utf-8 -*-
# UX24: the STATE.md edit (Updated line, the previous line kept as קודם, the
# decisions paragraph before UX23's). A file and not a heredoc because a
# python heredoc with Hebrew dies on the \xd7 encoding check.
import io

p = 'STATE.md'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')
assert lines[2].startswith('Updated: 2026-10-15 00:20 (UX23'), lines[2][:40]
old_updated = lines[2]
new_updated = (
    'Updated: 2026-10-15 02:00 (UX24 חלון הרשמה בשלבים: אימות טלפון, אישור תנאים, אנימציית ברוכים הבאים. '
    '**נמדד לפני** (‏logs/ux24/before.json, ה-build הקיים של ‏43738bf43 ב-380/768/1440 על ‏3364, אנונימי, ‏/ ואז "הרשמה" בתוך חלון הכניסה, ואז ‏/signup): הלחיצה עזבה את הדף אל ‏/signup?next=... בכל רוחב; ‏/signup היה טופס אחד של ארבעה שדות (‏42px) ושני כפתורים (‏Google ‏42px, "הרשמה" ‏40px), **בלי שום פקד של תנאי שימוש**, בלי ‏stepper, הקוד בדף שני (‏redirect) והסיום בדף שלישי. '
    '**עכשיו**: ‏components/auth/RegisterPanel, גוף אחד ל-/signup ולחלון: ‏<ol class="register-steps" aria-label="שלבי ההרשמה"> של ארבעה שלבים (פרטים / טלפון ותנאים / אימות הטלפון / ברוכים הבאים) עם ‏aria-current="step" אחד, ‏data-state ‏done/current/upcoming/skipped, אזור ‏aria-live ("שלב N מתוך 4: …") ופוקוס על כותרת השלב בכל מעבר; שלבים 1 ו-2 הם שני ‏fieldset של טופס אחד (‏noValidate, הלא-פעיל ‏hidden): שלב 1 מתקדם **בלקוח** מול ‏signupSchema.pick (‏lib/auth/register-steps.ts: ‏detailsIssues, ‏phoneStepIssues, ‏stepStates, ‏stepForField, ‏stepAnnouncement) עם ‏aria-invalid לכל שדה ובלי בקשה, "חזרה לפרטים" שומר את המוקלד, תיבת התנאים לא מסומנת מראש עם קישורי תקנון ופרטיות בלשונית חדשה ומסורבת בלקוח (‏role=alert) **וגם בשרת** (‏lib/auth/terms-acceptance.ts) לפני ‏signUp; שלב 3 (קוד, שליחה חוזרת, "דלגו בינתיים") רק כשקוד באמת יצא, אחרת מסומן ‏skipped; שלב 4 ‏welcome ב-CSS בלבד (טבעת שמציירת את עצמה, וי, שישה נקודים; ‏prefers-reduced-motion מכבה) עם השם הפרטי, כתובת המייל, סימון הטלפון, "המשך לגלוש" (בחלון: סוגר ומחזיר פוקוס; בדף: קישור ל-next) ו"לכניסה". '
    '‏server/auth/register-core.ts הוא ההרשמה האחת (תקרה, סכימה עם **שם השדה** שנכשל, תנאים, ‏signUp עם הרשומה ב-options.data דרך ‏server/auth/terms-record.ts: ‏terms_accepted_at + ‏terms_version ‏1.1 + ‏privacy_version ‏2.1, ואז אתגר ‏SMS רק למשתמש שנוצר); ‏signUpWithEmail (‏redirect) ו-server/actions/register.ts ‏registerAccount (מחזיר ‏RegisterState: ‏error+field / verify / welcome) עטיפות; ‏server/auth/signup-phone-steps.ts מחזיק באותו אופן את שני צעדי הקוד ל-verifySignupPhone (‏redirect) ול-verifyRegisterPhone (‏welcome); מפת שגיאות ‏GoTrue עברה ל-server/auth/gotrue-errors.ts ונבדקת כהתנהגות. אות החלון נושא ‏mode (‏LoginLink קורא מה-href דרך ‏modeFromAuthHref), ‏LoginDialog מכותר לפיו (‏data-mode) ושני הפאנלים מחליפים במקום (‏LoginPanel ‏onSignup, ‏RegisterPanel ‏onLogin) עם פוקוס חוזר לפאנל; ‏SignupForm.tsx נמחק. מיגרציה ‏272 (ממתינה) משקפת את ההסכמה ל-profiles בטריגר שני על ‏auth.users + ‏backfill. ‏next.config: ‏staticGenerationMaxConcurrency ‏4 + ‏staticGenerationRetryCount ‏2 אחרי שלושה ‏build נקיים שמתו על ‏fetch failed מה-Nano. '
    '**נמדד אחרי** (‏logs/ux24/after.json, ‏build טרי על ‏3364): הלחיצה על "הרשמה" שומרת על ה-URL ומחליפה את החלון ל"יצירת חשבון" בכל רוחב (‏350x640 ב-380, ‏416x641 ב-768/1440), ‏aria-modal, ‏overflow hidden, פוקוס על ה-DIALOG, ‏stepper ‏302x41 (‏368x42) עם ‏current* על פרטים, שלושה שדות ‏42 וכפתורים ‏44 (‏Google, "המשך"), "המשך" מתקדם לשלב 2 ב-**0 ‏POST** עם פוקוס על ‏H3 "טלפון ותנאים" ואזור חי "שלב 2 מתוך 4", תיבת תנאים ‏20x20 בשורה ‏44 עם שני הקישורים, "חזרה" מחזיר "דנה כהן", שליחה בלי התיבה: ‏0 ‏POST; ‏Escape סוגר; ‏/signup: כותרת "יצירת חשבון", ‏stepper ‏298x41 (‏334x42), ‏Google ו"המשך" ‏44; אפס שגיאות דף. '
    'נעוץ ב-register-steps.test (8), ‏terms-acceptance.test (2), ‏register.test (7), ‏RegisterPanel.test (9), ‏LoginDialog.test (+4), ‏LoginPanel.test (+2), ‏LoginLink.test (+1), ‏useLoginDialogRequest.test (+1), ‏login-dialog.test (+1), ‏auth-actions.test (התיבה נדרשת, הרשומה נכתבת), ‏auth-error-map.test (נכתב מחדש), ‏e2e/register-dialog.spec.ts (‏5 מקרים, ‏10/10 ב-chromium + mobile-chrome), ‏e2e/auth.spec.ts (דף ההרשמה כ-stepper); שכנים: ‏auth.spec + ‏login-dialog.spec ‏52/56 בריצה המשותפת, הכשל היחיד שאינו מהגoal הזה (הכניסה האמיתית דרך החלון) עבר לבד מיד אחרי. '
    'שערים: ‏vitest ‏878 קבצים / ‏10130 ירוקים, ‏type-check ו-lint נקיים, ‏build טרי ירוק (שער ה-csp נקי), שער הבית ‏REFUSED (‏live side is our-build, כמו ‏UX22/23). ‏docs/AUTH-MODEL.md §12 מתעד; ‏COMPONENT-QUEUE קיבל שורת ledger (UX24). הפירוט ב"החלטות שהתקבלו לבד (UX24)". המשך מ: ‏UX25)'
)
lines[2] = new_updated
lines.insert(3, 'קודם: ' + old_updated[len('Updated: '):])

decisions = (
    '**החלטות שהתקבלו לבד (UX24, 02:00):** (1) **ארבעה שלבים בטופס אחד ולא ארבעה טפסים**: שני ‏fieldset עם ‏hidden על הלא-פעיל, כך ששליחה בשלב 2 נושאת את כל השדות ושום ‏state לא צריך להישמר בשרת בין שלבים; ‏noValidate כי ‏required בשדה מוסתר חוסם ‏submit עם בועה שאיש לא רואה, והמשפטים הם של ‏zod משני הצדדים (‏signupSchema.pick). '
    '(2) **הרשומה ב-metadata ולא בעמודה**: ‏signUp מקבל ‏terms_accepted_at/terms_version/privacy_version ב-options.data ונכתב באותו ‏INSERT שיוצר את החשבון, בלי לחכות ל-272; ‏272 ממתינה ומשקפת ל-profiles בטריגר **שני** (‏on_auth_user_created_terms) ולא בעריכת ‏handle_new_user, שהעותק שלו בפרודקשן אינו זה שבקבצים (‏BRANCH-AUDIT). '
    '(3) **גרסה ולא בוליאני**: ‏termsDoc.version / ‏privacyDoc.version נקראים מהתוכן המשפטי עצמו (‏server/auth/terms-record.ts, צד שרת בלבד, כדי שהתקנון כולו לא ייכנס ל-chunk של הלקוח; ‏lib/auth/terms-acceptance.ts הוא החצי הבטוח ללקוח). '
    '(4) **פעולות ‏inline במקום ‏redirect**: ‏registerAccount/verifyRegisterPhone מחזירים ‏RegisterState כי ה-stepper יושב בחלון מעל דף כלשהו ו-redirect היה עוזב אותו; הישנים נשארו עטיפות של אותו גוף (‏server/auth/register-core.ts, ‏signup-phone-steps.ts) כדי שלא יהיו שתי הרשמות; ‏/signup/verify-phone ו-/signup/confirm נשארו כיעדיהם. '
    '(5) **‏toHebrew יצא מ-auth.ts**: קובץ ‏use server לא מייצא עוזר סינכרוני, והליבה המשותפת צריכה אותו; ‏auth-error-map.test שקרא את המקור בגלל זה נכתב מחדש כבדיקת התנהגות. '
    '(6) **שגיאת שרת חוזרת לשלב של השדה**: ‏field ב-RegisterState + ‏stepForField, אחרת "כתובת האימייל כבר רשומה" הייתה מוצגת מתחת לטלפון. '
    '(7) **‏RegisterField מוגדר בלקוח**: ‏import type מליבת השרת ב-lib/auth/register-steps.ts נפל ב-catalogue-render-path.test שהולך על שורות ‏import; הטיפוס הוגדר ב-lib והשרת מייבא ממנו (נרשם בזיכרון). '
    '(8) **אין ‏e2e שיוצר חשבון**: ה-build המקומי מדבר עם הפרויקט המאוחסן והרשמה היא שורה אמיתית ב-auth.users ותקרה ‏5/שעה; ה-welcome נעוץ ב-RegisterPanel.test ו-LoginDialog.test. '
    '(9) **‏staticGenerationMaxConcurrency 4 + ‏RetryCount 2**: שלושה ‏build נקיים ברצף מתו על עמוד אחר בכל פעם עם ‏UND_ERR_SOCKET מקריאת קטלוג (‏logs/ux24/build{,2,3}.log), ‏burst של ‏16 בקשות ענה ‏0.45–9.5 שניות; הרביעי (עם ההגדרה) ירוק. שינוי מתועד ב-next.config עם המדידה. '
    '(10) **פוקוס חוזר לפאנל בהחלפת גוף**: נמדד ב-after.json הראשון שאחרי "הרשמה" הפוקוס נפל ל-BODY מאחורי ה-overlay (הקישור שנלחץ פורק עם הגוף הישן); ‏useEffect על ‏mode מחזיר אותו ל-dialog, נמדד שוב ב-build הסופי: ‏DIALOG בכל רוחב. '
    '(11) **הכשל השכן בריצה המשותפת לא תוקן**: "כניסה אמיתית דרך החלון" נכשל כשחרומיום ו-mobile-chrome רצו אותו במקביל (‏check_rate_limit ‏1.1 שניות ב-DB איטי) ועבר לבד מיד אחרי ב-4.5 שניות; לא מה-goal הזה.'
)
idx = next(i for i, l in enumerate(lines) if l.startswith('**החלטות שהתקבלו לבד (UX23'))
lines.insert(idx, decisions)
lines.insert(idx + 1, '')
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('ok', idx)
