# סבב סודות — צעד אחר צעד

‏נכתב ‏02.09.2026. לכל סוד: איפה הוא חי, איך מסובבים, ומה נשבר אם מדלגים על
צעד. שני כללים חוצי-סודות:

1. **משתנה חדש ב-Vercel דורש redeploy**, לא restart. עד אז הקוד רץ עם הערך
   הישן.
2. **לסודות עם `_PREVIOUS` יש חלון חסד מובנה** — הערך הישן עובר לשם, מתקבל
   בכניסה ולעולם לא מונפק החוצה. בלעדיו, סיבוב מפיל את מי שכבר באמצע תהליך.

## Supabase service key (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`)

1. ‏Supabase Dashboard → Project Settings → API Keys → צור `sb_secret_...` חדש.
2. עדכן ב-Vercel את `SUPABASE_SECRET_KEY` (הקוד מקבל את שתי הצורות —
   ‏`admin-key.ts`). ‏redeploy.
3. בטל את המפתח הישן בדשבורד **רק אחרי** שה-deploy החדש ירוק ב-/api/health.
4. עדכן גם: ‏GitHub Actions secrets (אם קיים שם), ‏`.env.local` המקומי.
   זכור: המפתח המקומי הנוכחי ממילא שגוי (ראה memory) — אל תשחזר אותו.

## Cardcom (`CARDCOM_API_PASSWORD`)

1. סיסמת API חדשה מול Cardcom (‏03-9436100 או פורטל המסוף).
2. עדכן ב-Vercel, ‏redeploy. אין חלון חסד — קריאות בזמן ההחלפה ייכשלו
   ונתפסות ב-stranded-payments; סובב בשעת שפל.

## סוד ה-webhook של Cardcom (`CARDCOM_WEBHOOK_SECRET`)

**הסוד היחיד שמסובב בשני שלבים חובה:**

1. הערך הישן עובר ל-`CARDCOM_WEBHOOK_SECRET_PREVIOUS`; חדש (`openssl rand
   -hex 32`) נכנס ל-`CARDCOM_WEBHOOK_SECRET`. ‏redeploy.
2. אחרי שחלון ה-checkout הארוך ביותר נסגר (24ש' בטוח) — הסר את `_PREVIOUS`.

דילוג על שלב 1 מפיל כל callback של עמוד תשלום שכבר פתוח בדפדפן של קונה,
**עם 200**, כך ש-Cardcom לא מנסה שוב. ‏`docs/RUNBOOK.md` מרחיב.

## חתימת QR של שוברים (`VOUCHER_QR_SECRET`)

כמו ה-webhook, עם חלון ארוך בהרבה: כל שובר שהונפק חתום בערך הישן.

1. ישן → `VOUCHER_QR_SECRET_PREVIOUS`; חדש נכנס; ‏`VOUCHER_QR_KEY_ID` עולה
   (‏v1→v2). ‏redeploy.
2. ‏`_PREVIOUS` נשאר **עד שפג תוקף השובר האחרון שנחתם בו** — חודשים, לא ימים.

## `CRON_SECRET`

1. ‏`openssl rand -hex 32`; עדכן ב-Vercel **וגם** ב-GitHub repo secret
   ‏`CRON_SECRET` (‏`scripts/set-github-secrets.sh` עושה את הצד של GitHub).
2. ‏redeploy. סדר לא קריטי — חלון קצר של 401 נסבל, הכל idempotent וה-runs
   הבאים מצליחים.

## Resend (`RESEND_API_KEY`)

1. ‏Resend → API Keys → צור חדש, עדכן ב-Vercel, ‏redeploy, מחק ישן.
2. בדיקה: ‏cron ‏notifications הבא שולח בפועל (או ‏/api/health).

## Upstash (‏Redis + ‏QStash)

1. ‏Upstash Console → סובב REST token / signing keys.
2. ‏QStash מסובב בזוג מובנה: ‏current→next. עדכן את
   ‏`QSTASH_CURRENT_SIGNING_KEY` + ‏`QSTASH_NEXT_SIGNING_KEY` יחד.
3. ‏Redis: נפילה באמצע = ‏fallback ל-Postgres limiter, לא תקלה.

## Sentry DSN

‏DSN אינו סוד הרסני (הוא ציבורי בבאנדל), אבל אם סובב: ‏Sentry → Client Keys,
עדכן `NEXT_PUBLIC_SENTRY_DSN` + ‏`SENTRY_DSN`, ‏redeploy (הציבורי נאפה
בזמן build).

## R2 (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`)

1. ‏Cloudflare → R2 → API tokens → צור זוג חדש, עדכן, ‏redeploy, מחק ישן.
2. נפילה = ‏fallback ל-Supabase Storage; העלאות אדמין הן הנפגע הראשון.

## טוקן Cloudflare שהודבק בצ'אט (01.09)

‏`cfut_...` הודבק בשיחה ב-01.09 לצורך עבודת ה-DNS. **לסובב בהזדמנות
הראשונה**: ‏Cloudflare → My Profile → API Tokens → Roll. נבדק אז: לא נשמר
לאף קובץ בריפו (סריקת דליפות 0 קבצים).

## מה אין

‏`AUTH_ENCRYPTION_KEY` מהספק של STEP 29 אינו קיים — אין הצפנת TOTP צד-אפליקציה;
ה-MFA הוא של Supabase (ראה MEGA-BLOCK-AUDIT, STEP 29).
