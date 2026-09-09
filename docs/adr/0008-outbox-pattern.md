# 0008 — ‏outbox אחד לכל ההתראות

**סטטוס:** נאכף.

‏`notification_outbox`: ‏kind בתוך CHECK פרוס (ההסכם התלת-כיווני —
constraint/enqueuers/buildNotification — נשמר על ידי ‏outbox-kinds.test),
‏dedupe_key ייחודי שמוגש ל-Resend כמפתח אידמפוטנטיות, ‏attempts עם backoff
מעריכי, ‏dead + ‏Retry באדמין, ניקוז ב-cron. מייל תפעולי למפעיל יחיד
(‏digest, ‏contact) הולך ישיר ב-Resend בכוונה — אין סיכון שהמכונה נבנתה
לכסות.
